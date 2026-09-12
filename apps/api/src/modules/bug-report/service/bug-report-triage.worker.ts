import { hostname } from 'node:os';

import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { BUG_REPORT_TRIAGE_CONFIG } from '../bug-report-config.token';
import { BugReportTriageConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { BugReportTriageService } from './bug-report-triage.service';

/**
 * Interval poller for the triage half of the bug-report outbox (P23-T09).
 *
 * Safe on more than one replica: rows are claimed under a lease with
 * `FOR UPDATE SKIP LOCKED`, the pattern the delivery outbox uses, so one report
 * is never sent to the triage vendor twice — which matters more here than for a
 * delivery, because each send is another copy of possibly-sensitive text at a
 * third party.
 *
 * The poll interval is deliberately slower than delivery's. Nobody is waiting:
 * intake already answered the reporter with their `BR-` reference, and the only
 * consumer of a triaged report is a Notion board a human reads later in the day.
 *
 * A deployment with no triage key still runs this worker, and should: the service
 * settles every report as `FALLBACK` in that case, so the board fills with
 * tickets written by the people who filed them rather than with nothing.
 */
@Injectable()
export class BugReportTriageWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BugReportTriageWorker.name);
  private readonly leasedBy = `${hostname()}:${process.pid}`;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    @Inject(BUG_REPORT_TRIAGE_CONFIG) private readonly triageConfig: BugReportTriageConfig,
    private readonly bugReportRepository: BugReportRepository,
    private readonly triageService: BugReportTriageService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.triageConfig.workerEnabled) {
      this.logger.log('Bug report triage worker disabled (BUG_TRIAGE_WORKER_ENABLED=false)');
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.triageConfig.workerPollIntervalMs);
    // Unreferenced, so a test run or a CLI command that boots the app is not held
    // open by a timer nobody is waiting on.
    this.pollTimer.unref();
    this.logger.log(
      `Bug report triage worker polling every ${this.triageConfig.workerPollIntervalMs}ms`,
    );
  }

  onApplicationShutdown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Runs one sweep; an overlapping sweep is skipped, never queued.
   *
   * Skipped rather than queued because a sweep that takes longer than the
   * interval is a sweep talking to a slow vendor, and queueing more of those
   * would multiply the load on exactly the thing that is already struggling. The
   * claimed rows keep their lease and the next tick picks up where this left off.
   */
  async pollOnce(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }
    this.isPolling = true;
    try {
      const claimedIds = await this.bugReportRepository.claimDueReports({
        status: 'RECEIVED',
        limit: this.triageConfig.workerBatchSize,
        leaseMs: this.triageConfig.leaseMs,
        leasedBy: this.leasedBy,
      });
      const reports = await this.bugReportRepository.findForTriage(claimedIds);
      for (const report of reports) {
        await this.triageService.processReport(report);
      }
      return reports.length;
    } catch {
      // The sweep, not one report: `processReport` never throws, so reaching here
      // means the claim or the read failed — a database problem, which the next
      // tick retries. Logged without the error, which could carry row values.
      this.logger.error(buildSafeErrorLog('bug_report_triage_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
