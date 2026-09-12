import { Inject, Injectable, Logger } from '@nestjs/common';
import { BugReportPublishRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { NotionHttpClient } from '../../../common/notion/notion-http.client';
import { NotionError } from '../../../common/notion/notion.error';
import { NotionPage } from '../../../common/notion/notion.types';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { NotificationService } from '../../notification/service/notification.service';
import { BUG_REPORT_PUBLISH_CONFIG } from '../bug-report-config.token';
import { BugReportPublishConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { buildBugBoardPageBody } from './build-bug-board-page-body';
import { buildBugBoardProperties } from './build-bug-board-properties';

const BUG_REPORT_AUDIT_RESOURCE = 'BugReport';

/**
 * The permission whose holders hear about a permanently failed publish.
 *
 * The same grant that gates the integrations card, because it names exactly the
 * people who can act: a revoked token or an unshared board is fixed on the
 * server or in Notion, and a clinic administrator can do neither.
 */
const NOTION_CONNECTOR_PERMISSION_KEY = 'notion-connector.manage:any';

const BACKOFF_EXPONENT_BASE = 2;

/**
 * Publishes one triaged report to the Notion Bug Board (P23-T10).
 *
 * The interesting problem here is duplicates, and it is not hypothetical: page
 * creation is not idempotent, and a timeout on create leaves the caller unable
 * to tell whether the page exists. The client reports that case as `AMBIGUOUS`
 * rather than guessing, and this service is what makes the guarantee concrete —
 * **every attempt on a report that has already failed ambiguously starts with a
 * Report-ID lookup.** A page found that way is adopted, not recreated, so the
 * board ends up holding exactly one ticket per report even when the network
 * disagreed about whether the first one landed.
 *
 * The other decision worth stating: an unconfigured connector is not a failure.
 * Rows stay `TRIAGED` and burn no attempts, so a deployment that gets its Notion
 * credentials a week late publishes its backlog rather than finding it in
 * `FAILED`.
 */
@Injectable()
export class BugReportPublishService {
  private readonly logger = new Logger(BugReportPublishService.name);

  constructor(
    @Inject(BUG_REPORT_PUBLISH_CONFIG) private readonly publishConfig: BugReportPublishConfig,
    private readonly bugReportRepository: BugReportRepository,
    private readonly notionHttpClient: NotionHttpClient,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Publishes one claimed report. Never throws, for the reason the triage
   * service does not: a claimed row must always be settled or explicitly
   * released, or it sits leased and invisible until the lease lapses.
   */
  async processReport(report: BugReportPublishRecord): Promise<void> {
    try {
      const page = await this.resolvePage(report);
      await this.settlePublished(report, page);
    } catch (caughtError) {
      await this.settleError(report, caughtError);
    }
  }

  /**
   * Finds the report's existing page, or creates one.
   *
   * The lookup runs only when `attemptCount > 0` — that is, only on a retry. A
   * first attempt cannot have created anything, and spending a query on every
   * publish to prove that would double the request count against a rate limit of
   * about three per second for no information.
   */
  private async resolvePage(report: BugReportPublishRecord): Promise<NotionPage> {
    const existing = report.attemptCount > 0 ? await this.findExistingPage(report) : null;
    if (existing !== null) {
      this.logger.warn(
        buildSafeErrorLog('bug_report_publish_adopted_existing_page', { reportId: report.id }),
      );
      return existing;
    }
    return this.notionHttpClient.createPage({
      properties: buildBugBoardProperties({
        report,
        clinicLabel: this.publishConfig.clinicLabel,
      }),
      children: buildBugBoardPageBody(report),
    });
  }

  /**
   * Looks the report up by its `BR-` reference before creating another page.
   *
   * A failed lookup is swallowed on purpose and reported as "no page found". The
   * alternative — letting it propagate — turns a read problem into a retry of
   * the whole publish, and the caller is about to attempt a create that will
   * fail the same way if Notion is genuinely unreachable. The cost of being
   * wrong here is a duplicate ticket; the cost of being wrong the other way is a
   * report that never publishes at all.
   */
  private async findExistingPage(report: BugReportPublishRecord): Promise<NotionPage | null> {
    try {
      const response = await this.notionHttpClient.queryDataSource({
        filter: { property: 'Report ID', rich_text: { equals: report.reference } },
        pageSize: 1,
      });
      return response.results?.[0] ?? null;
    } catch {
      this.logger.warn(
        buildSafeErrorLog('bug_report_publish_lookup_failed', { reportId: report.id }),
      );
      return null;
    }
  }

  private async settlePublished(
    report: BugReportPublishRecord,
    page: NotionPage,
  ): Promise<void> {
    await this.bugReportRepository.markPublished({
      id: report.id,
      notionPageId: page.id,
      notionPageUrl: page.url ?? null,
      publishedAt: new Date(),
    });
    await this.auditService.record({
      action: 'BUG_REPORT_PUBLISHED',
      resource: BUG_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      metadata: {
        reference: report.reference,
        triagedBy: report.triagedBy,
        notionPageId: page.id,
      },
    });
  }

  /**
   * A `PERMANENT` Notion error is final; everything else gets another attempt.
   *
   * The distinction is the client's (`NotionError.kind`) and it is the right one
   * to trust: `PERMANENT` means retrying the identical request cannot succeed —
   * a rejected payload, a revoked token, a board never shared with this
   * integration. Backing off against those would hide a configuration problem
   * behind an hour of silence.
   *
   * `AMBIGUOUS` is treated as retryable, which is what makes the Report-ID
   * lookup above meaningful: the next attempt is exactly where a page created by
   * this one gets found.
   */
  private async settleError(report: BugReportPublishRecord, caughtError: unknown): Promise<void> {
    const notionError =
      caughtError instanceof NotionError
        ? caughtError
        : new NotionError('RETRYABLE', 'Bug report publish failed');
    const reason = notionError.notionCode ?? notionError.kind.toLowerCase();
    const attemptNumber = report.attemptCount + 1;
    const isFinal =
      notionError.kind === 'PERMANENT' || attemptNumber >= this.publishConfig.maxAttempts;
    this.logger.warn(
      buildSafeErrorLog('bug_report_publish_failed', {
        reportId: report.id,
        kind: notionError.kind,
        notionCode: notionError.notionCode ?? null,
        attempt: attemptNumber,
        isFinal: isFinal ? 'true' : 'false',
      }),
    );
    if (isFinal) {
      await this.settleFailed(report, reason);
      return;
    }
    await this.bugReportRepository.rescheduleAttempt({
      id: report.id,
      error: reason,
      nextAttemptAt: new Date(Date.now() + this.resolveBackoffMs(notionError, attemptNumber)),
    });
  }

  /**
   * Notion's own `Retry-After` wins over the exponential backoff when it is
   * longer — it is the only party that knows how long it wants to be left alone,
   * and going back early against a rate limit is how a limit becomes a block.
   */
  private resolveBackoffMs(notionError: NotionError, attemptNumber: number): number {
    const backoffMs =
      this.publishConfig.retryBaseDelayMs * BACKOFF_EXPONENT_BASE ** (attemptNumber - 1);
    return Math.max(backoffMs, notionError.retryAfterMs ?? 0);
  }

  private async settleFailed(report: BugReportPublishRecord, reason: string): Promise<void> {
    await this.bugReportRepository.markFailed({ id: report.id, error: reason });
    await this.auditService.record({
      action: 'BUG_REPORT_PUBLISH_FAILED',
      resource: BUG_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      metadata: { reference: report.reference, reason },
    });
    await this.notifyConnectorManagers(report, reason);
  }

  /**
   * Tells whoever administers the connector, because nobody else will notice.
   *
   * A failed publish is silent by construction: the reporter was answered at
   * intake and is never shown the board, so without this row a revoked token
   * means bug reports simply stop arriving, and the first anybody hears of it is
   * somebody wondering why the board has been quiet.
   *
   * Carries Notion's error code, which is the difference between the two
   * failures an operator confuses: `object_not_found` means the board was
   * unshared, `unauthorized` means the token is wrong. A generic message sends
   * people to rotate a credential that was fine.
   */
  private async notifyConnectorManagers(
    report: BugReportPublishRecord,
    reason: string,
  ): Promise<void> {
    try {
      await this.notificationService.createForUsersWithPermission(
        NOTION_CONNECTOR_PERMISSION_KEY,
        {
          type: 'BUG_REPORT_PUBLISH_FAILED',
          titleKey: 'bugReportPublishFailed.title',
          bodyKey: 'bugReportPublishFailed.body',
          params: { reference: report.reference, reason },
          href: '/admin/integrations',
        },
      );
    } catch {
      this.logger.warn(buildSafeErrorLog('bug_report_publish_notification_failed'));
    }
  }
}
