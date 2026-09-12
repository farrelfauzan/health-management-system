import { hostname } from 'node:os';

import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { NotionHttpClient } from '../../../common/notion/notion-http.client';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { BUG_REPORT_PUBLISH_CONFIG } from '../bug-report-config.token';
import { BugReportPublishConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { BugReportPublishService } from './bug-report-publish.service';

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Interval poller for the publishing half of the bug-report outbox (P23-T10).
 *
 * A second worker rather than a second phase of the triage sweep, because the
 * two halves fail independently and for unrelated reasons: the triage vendor can
 * be down while Notion is fine, and a board can be unshared while the model
 * answers perfectly. One sweep would make either outage stall the other half's
 * backlog.
 *
 * The purge runs from here too, once a day, because it is the same kind of work:
 * a slow background sweep over rows nobody is waiting on, whose schedule is set
 * by `docs/security/ai-vendor-dpa.md` §5c rather than by a user action.
 */
@Injectable()
export class BugReportPublishWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BugReportPublishWorker.name);
  private readonly leasedBy = `${hostname()}:${process.pid}`;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastPurgeAtEpochMs = 0;

  constructor(
    @Inject(BUG_REPORT_PUBLISH_CONFIG) private readonly publishConfig: BugReportPublishConfig,
    private readonly bugReportRepository: BugReportRepository,
    private readonly publishService: BugReportPublishService,
    private readonly notionHttpClient: NotionHttpClient,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.publishConfig.workerEnabled) {
      this.logger.log('Bug report publish worker disabled (BUG_REPORT_PUBLISH_WORKER_ENABLED=false)');
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.publishConfig.workerPollIntervalMs);
    this.pollTimer.unref();
    this.logger.log(
      `Bug report publish worker polling every ${this.publishConfig.workerPollIntervalMs}ms`,
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
   * **An unconfigured connector returns before claiming anything.** This is the
   * ticket's explicit requirement and it matters: claiming a row and then
   * discovering there is nowhere to send it would count an attempt, so a
   * deployment waiting on its Notion credentials would find its backlog in
   * `FAILED` by the time they arrived. The purge still runs — retention does not
   * depend on whether a board exists.
   */
  async pollOnce(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }
    this.isPolling = true;
    try {
      await this.purgeExpiredContentOncePerDay();
      if (!this.notionHttpClient.isConfigured()) {
        return 0;
      }
      const claimedIds = await this.bugReportRepository.claimDueReports({
        status: 'TRIAGED',
        limit: this.publishConfig.workerBatchSize,
        leaseMs: this.publishConfig.leaseMs,
        leasedBy: this.leasedBy,
      });
      const reports = await this.bugReportRepository.findForPublish(claimedIds);
      for (const report of reports) {
        await this.publishService.processReport(report);
      }
      return reports.length;
    } catch {
      this.logger.error(buildSafeErrorLog('bug_report_publish_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Purges expired report text on the §5c schedule.
   *
   * Rate-limited in memory rather than scheduled, because this repo has no cron
   * and a sweep that ran every poll would issue a pointless `UPDATE … WHERE` a
   * few times a minute. The counter resets on restart, which means a deployment
   * that restarts often purges more often than daily — harmless, since the
   * predicate is idempotent and `content_purged_at` excludes rows already done.
   */
  private async purgeExpiredContentOncePerDay(): Promise<void> {
    if (Date.now() - this.lastPurgeAtEpochMs < MILLISECONDS_PER_DAY) {
      return;
    }
    this.lastPurgeAtEpochMs = Date.now();
    const purgedCount = await this.bugReportRepository.purgeExpiredContent({
      publishedBefore: new Date(
        Date.now() - this.publishConfig.publishedTextRetentionDays * MILLISECONDS_PER_DAY,
      ),
      heldBefore: new Date(
        Date.now() - this.publishConfig.heldTextRetentionDays * MILLISECONDS_PER_DAY,
      ),
    });
    if (purgedCount > 0) {
      this.logger.log(buildSafeErrorLog('bug_report_content_purged', { purgedCount }));
    }
  }
}
