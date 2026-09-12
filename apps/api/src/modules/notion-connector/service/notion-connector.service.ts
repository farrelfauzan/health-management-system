import { Inject, Injectable } from '@nestjs/common';

import {
  NotionBugBoardFieldProblem,
  NotionConnectionTestResult,
  NotionConnectorStatusView,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { NOTION_CONFIG } from '../../../common/notion/notion-config.token';
import { NotionHttpClient } from '../../../common/notion/notion-http.client';
import { NotionError } from '../../../common/notion/notion.error';
import { NotionConfig } from '../../../common/notion/notion.types';
import { BugReportService } from '../../bug-report/service/bug-report.service';
import { BUG_BOARD_REQUIRED_FIELDS } from './bug-board-required-fields';
import { checkBugBoardFields } from './check-bug-board-fields';

const NOTION_CONNECTOR_AUDIT_RESOURCE = 'NotionConnector';
/**
 * The pseudo-field a connection failure is reported under. A board nobody
 * shared with this integration and a renamed column are the same class of
 * problem to the operator reading the card — both stop every publish — so they
 * belong in one list rather than in a failure mode the card has to render
 * separately.
 */
const CONNECTION_PROBLEM_FIELD = 'connection';
const DATA_SOURCE_ID_HINT_LENGTH = 4;

@Injectable()
export class NotionConnectorService {
  constructor(
    @Inject(NOTION_CONFIG) private readonly notionConfig: NotionConfig,
    private readonly notionHttpClient: NotionHttpClient,
    private readonly auditService: AuditService,
    private readonly bugReportService: BugReportService,
  ) {}

  /**
   * What the card shows without touching Notion: whether this deployment is
   * configured at all, the API version pinned in code, four characters of the
   * board id, this process's breaker state, and when a report last reached the
   * board.
   *
   * The last of those is the only one that says the pipeline *works* rather than
   * that it is configured, which is why it is worth one indexed query: a green
   * connector whose last publish was three weeks ago is the failure this card
   * exists to surface, and nothing else on it can tell that apart from a quiet
   * month.
   */
  async getStatus(): Promise<NotionConnectorStatusView> {
    const lastPublishedAt = await this.bugReportService.findLastPublishedAt();
    return {
      isConfigured: this.notionConfig.isConfigured,
      apiVersion: this.notionHttpClient.getApiVersion(),
      dataSourceIdLast4: this.resolveDataSourceIdHint(),
      circuitBreakerState: this.notionHttpClient.getCircuitBreakerState(),
      lastPublishedAt: lastPublishedAt?.toISOString() ?? null,
    };
  }

  /**
   * Reads the Bug Board's schema and reports every reason a publish would be
   * rejected. Always answers; a failure is a result, not an exception.
   *
   * An unconfigured deployment returns immediately without calling Notion and
   * without writing an audit row — nothing was tested, so there is nothing to
   * record.
   */
  async testConnection(actor: CurrentUser): Promise<NotionConnectionTestResult> {
    const checkedAt = new Date().toISOString();
    if (!this.notionConfig.isConfigured) {
      return { isConfigured: false, isSuccessful: false, checkedAt, problems: [] };
    }
    const problems = await this.collectProblems();
    await this.auditService.record({
      action: 'NOTION_CONNECTION_TESTED',
      resource: NOTION_CONNECTOR_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { isSuccessful: problems.length === 0, problemCount: problems.length },
    });
    return {
      isConfigured: true,
      isSuccessful: problems.length === 0,
      checkedAt,
      problems,
    };
  }

  private async collectProblems(): Promise<NotionBugBoardFieldProblem[]> {
    try {
      const dataSource = await this.notionHttpClient.retrieveDataSource();
      return checkBugBoardFields({ dataSource, requirements: BUG_BOARD_REQUIRED_FIELDS });
    } catch (caughtError) {
      return [this.describeConnectionFailure(caughtError)];
    }
  }

  /**
   * Notion's own error code, verbatim, because it is the difference between
   * the two failures an operator confuses: `object_not_found` means the board
   * was never shared with this integration, `unauthorized` means the token is
   * wrong. A generic "could not connect" sends people to rotate a token that
   * was fine.
   */
  private describeConnectionFailure(caughtError: unknown): NotionBugBoardFieldProblem {
    const notionCode =
      caughtError instanceof NotionError ? (caughtError.notionCode ?? 'unknown') : 'unknown';
    return {
      field: CONNECTION_PROBLEM_FIELD,
      expected: 'the Bug Board is readable by this integration',
      actual: notionCode,
    };
  }

  private resolveDataSourceIdHint(): string | null {
    const dataSourceId = this.notionConfig.bugBoardDataSourceId;
    if (dataSourceId === undefined) {
      return null;
    }
    return dataSourceId.slice(-DATA_SOURCE_ID_HINT_LENGTH);
  }
}
