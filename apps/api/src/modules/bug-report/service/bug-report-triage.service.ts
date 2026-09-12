import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BugReportTriageRecord,
  DetectSensitiveDataOptions,
  FILE_BUG_TICKET_TOOL_NAME,
  FileBugTicketArguments,
  fileBugTicketSchema,
} from '@hms/shared-types';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { AuditService } from '../../../common/audit/audit.service';
import { resolveMrnConfig } from '../../../common/mrn/mrn.config';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ChatToolCall } from '../../ai-chatbot/infrastructure/ai-provider.types';
import { AiProviderRegistry } from '../../ai-chatbot/infrastructure/providers/ai-provider-registry.service';
import { DEFAULT_AI_PROVIDER_BASE_URLS } from '../../ai-chatbot/infrastructure/providers/ai-provider-base-urls';
import { NotificationService } from '../../notification/service/notification.service';
import { BUG_REPORT_TRIAGE_CONFIG } from '../bug-report-config.token';
import { BugReportTriageConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { buildBugTriagePrompt } from './build-bug-triage-prompt';
import {
  buildRedactedBugReport,
  RedactedBugReport,
  renderRedactedBugReportText,
} from './bug-report-triage.payload';

const BUG_REPORT_AUDIT_RESOURCE = 'BugReport';

/**
 * The config id the breaker and the logs key triage calls on.
 *
 * A constant rather than a database id because there is no row behind this
 * provider — it is Saling Jaga's own key, one per deployment. Distinct from the
 * chat gateway's `platform-env` so a dead triage vendor never opens the
 * clinic's chat circuit, and vice versa.
 */
const BUG_TRIAGE_CONFIG_ID = 'bug-triage-env';

/**
 * How many times one report is offered to the model before falling back.
 *
 * Two: the first answer, and one retry if it came back unparseable. A model
 * that twice fails to fill a nine-field schema will not manage it on the third
 * go, and each attempt is another copy of the report at the vendor.
 */
const MAX_SCHEMA_ATTEMPTS = 2;

const BACKOFF_EXPONENT_BASE = 2;

/**
 * Turns one stored report into ticket content (P23-T09).
 *
 * The shape of this service is the security argument. The report is untrusted
 * text; the model is offered exactly one tool and forced to use it; its answer
 * is parsed against `fileBugTicketSchema` before anything reads it; and the
 * model never learns that Notion exists, let alone holds a token for it. A
 * report engineered to make the assistant "publish something else" has nothing
 * to publish with — the worst it achieves is a wrongly filled ticket.
 *
 * Every path ends with the report moving on. Success gives `TRIAGED`/`AI`;
 * a flag gives `HELD`; an unreachable vendor, an unparseable answer twice over,
 * exhausted attempts or an un-triaged report older than the staleness limit all
 * give `TRIAGED`/`FALLBACK` carrying the reporter's redacted words. Nothing
 * waits in `RECEIVED` for a vendor that is not coming back.
 */
@Injectable()
export class BugReportTriageService {
  private readonly logger = new Logger(BugReportTriageService.name);
  private readonly mrnOptions: DetectSensitiveDataOptions;

  constructor(
    @Inject(BUG_REPORT_TRIAGE_CONFIG) private readonly triageConfig: BugReportTriageConfig,
    private readonly bugReportRepository: BugReportRepository,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    const mrnConfig = resolveMrnConfig(configService);
    this.mrnOptions = { mrnFormat: { prefix: mrnConfig.prefix, width: mrnConfig.width } };
  }

  /**
   * Triages one claimed report. Never throws: a report the worker claimed must
   * always be settled or explicitly rescheduled, because a thrown error would
   * leave it leased and invisible until the lease lapses.
   */
  async processReport(report: BugReportTriageRecord): Promise<void> {
    const redacted = buildRedactedBugReport(report, this.mrnOptions);
    if (!this.triageConfig.isConfigured || this.isStale(report)) {
      await this.settleFallback(report, redacted);
      return;
    }
    try {
      const ticket = await this.requestTicket(redacted);
      await this.settleTicket(report, redacted, ticket);
    } catch (caughtError) {
      await this.settleProviderFailure(report, redacted, caughtError);
    }
  }

  /**
   * Asks the model for the ticket, retrying once if the answer does not fit the
   * schema.
   *
   * A schema miss is retried inside this method rather than by rescheduling the
   * row, because it is not a transport problem: the vendor answered, promptly,
   * with something unusable. Parking the report for a minute would not improve
   * the next answer, and would spend a worker sweep to find that out.
   */
  private async requestTicket(redacted: RedactedBugReport): Promise<FileBugTicketArguments> {
    let lastIssue = '';
    for (let attempt = 1; attempt <= MAX_SCHEMA_ATTEMPTS; attempt += 1) {
      const toolCall = await this.callProvider(redacted, attempt > 1);
      const parsed = fileBugTicketSchema.safeParse(toolCall?.arguments);
      if (parsed.success) {
        return parsed.data;
      }
      lastIssue = parsed.error.issues[0]?.path.join('.') ?? 'missing tool call';
      this.logger.warn(
        buildSafeErrorLog('bug_triage_invalid_tool_output', { attempt, field: lastIssue }),
      );
    }
    throw new Error(`Triage model produced invalid tool arguments (${lastIssue})`);
  }

  /**
   * One completion with the single forced tool.
   *
   * The tool's JSON Schema is derived from the very Zod object that validates
   * the answer — `$refStrategy: 'none'` so providers read a self-contained
   * parameters object — which is what makes "the model was told the shape" and
   * "the shape was enforced" the same statement rather than two that can drift.
   */
  private async callProvider(
    redacted: RedactedBugReport,
    isRetry: boolean,
  ): Promise<ChatToolCall | undefined> {
    const { systemPrompt, userMessage } = buildBugTriagePrompt(redacted);
    const adapter = this.providerRegistry.resolveAdapter(this.requireProviderKind());
    const result = await adapter.sendChatCompletion(
      {
        configId: BUG_TRIAGE_CONFIG_ID,
        providerKind: this.requireProviderKind(),
        apiKey: this.triageConfig.apiKey,
        baseUrl: this.resolveBaseUrl(),
        model: this.triageConfig.model ?? '',
        maxTokens: this.triageConfig.maxTokens,
        timeoutMs: this.triageConfig.timeoutMs,
      },
      {
        sessionExternalId: null,
        // The channel a triage call is tagged with. 'ADMIN' rather than a new
        // value: the enum describes who a chat is *with*, and triage is not a
        // chat at all — this is metadata the adapters pass through untouched.
        channel: 'ADMIN',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: isRetry
              ? `${userMessage}\n\nYour previous answer did not match the tool schema. Call ${FILE_BUG_TICKET_TOOL_NAME} again with every required field.`
              : userMessage,
          },
        ],
        contextPayload: {},
        tools: [
          {
            name: FILE_BUG_TICKET_TOOL_NAME,
            description:
              'File one engineering ticket for this bug report. This is the only action available to you.',
            parameters: buildToolParameters(),
          },
        ],
      },
    );
    return result.toolCalls.find((toolCall) => toolCall.name === FILE_BUG_TICKET_TOOL_NAME);
  }

  /** Valid ticket content: HELD when the model flagged it, TRIAGED otherwise. */
  private async settleTicket(
    report: BugReportTriageRecord,
    redacted: RedactedBugReport,
    ticket: FileBugTicketArguments,
  ): Promise<void> {
    if (ticket.mayContainPersonalData) {
      await this.settleHeld(report, redacted);
      return;
    }
    await this.bugReportRepository.markTriaged({
      id: report.id,
      triage: ticket,
      triagedBy: 'AI',
      redactedText: null,
    });
    await this.recordTriageAudit('BUG_REPORT_TRIAGED', report, redacted, {
      triagedBy: 'AI',
      severity: ticket.severity,
      module: ticket.module,
    });
  }

  /**
   * The report stops here and is never published (§5c layer 4).
   *
   * The reporter is told, because they are the only person who can fix it: the
   * text is theirs, they know what they wrote, and asking them to file it again
   * without the detail is the whole remedy. The notification carries the
   * reference and no hint of what was flagged — the bell feed is read on a
   * shared terminal.
   *
   * The redacted text is stored even though nothing will publish it: a person
   * checking whether HELD is firing sensibly needs to see something, and the
   * unredacted original is purged on the §5c schedule regardless.
   */
  private async settleHeld(
    report: BugReportTriageRecord,
    redacted: RedactedBugReport,
  ): Promise<void> {
    await this.bugReportRepository.markHeld({ id: report.id, heldAt: new Date() });
    await this.recordTriageAudit('BUG_REPORT_HELD', report, redacted, {});
    await this.notifyReporterHeld(report);
  }

  private async notifyReporterHeld(report: BugReportTriageRecord): Promise<void> {
    try {
      await this.notificationService.createForUser({
        userId: report.reporterUserId,
        type: 'BUG_REPORT_HELD',
        titleKey: 'bugReportHeld.title',
        bodyKey: 'bugReportHeld.body',
        params: { reference: report.reference },
      });
    } catch {
      // Best-effort, like every other producer: a failed bell row must not undo
      // the hold, which is the control that actually matters here.
      this.logger.warn(buildSafeErrorLog('bug_triage_held_notification_failed'));
    }
  }

  /**
   * The vendor failed, or answered twice with something unusable.
   *
   * Counted and backed off while attempts remain, then settled as FALLBACK
   * rather than FAILED: a bug report is worth reading even when no model
   * summarised it, and a report nobody publishes is a report nobody fixes.
   */
  private async settleProviderFailure(
    report: BugReportTriageRecord,
    redacted: RedactedBugReport,
    caughtError: unknown,
  ): Promise<void> {
    const attemptNumber = report.attemptCount + 1;
    this.logger.warn(
      buildSafeErrorLog('bug_triage_attempt_failed', {
        reportId: report.id,
        attempt: attemptNumber,
        reason: describeTriageError(caughtError),
      }),
    );
    if (attemptNumber >= this.triageConfig.maxAttempts) {
      await this.settleFallback(report, redacted);
      return;
    }
    const delayMs =
      this.triageConfig.retryBaseDelayMs * BACKOFF_EXPONENT_BASE ** (attemptNumber - 1);
    await this.bugReportRepository.rescheduleAttempt({
      id: report.id,
      error: describeTriageError(caughtError),
      nextAttemptAt: new Date(Date.now() + delayMs),
    });
  }

  /** TRIAGED with the reporter's own redacted words as the ticket body. */
  private async settleFallback(
    report: BugReportTriageRecord,
    redacted: RedactedBugReport,
  ): Promise<void> {
    await this.bugReportRepository.markTriaged({
      id: report.id,
      triage: null,
      triagedBy: 'FALLBACK',
      redactedText: renderRedactedBugReportText(redacted),
    });
    await this.recordTriageAudit('BUG_REPORT_TRIAGED', report, redacted, {
      triagedBy: 'FALLBACK',
    });
  }

  /**
   * What was sent, as field names and character counts — never the text.
   *
   * The audit trail answers "was the boundary respected", and a row quoting the
   * report would put a copy of it in a table with a different retention rule
   * from the report itself, which is the leak the whole feature is built to
   * avoid.
   */
  private async recordTriageAudit(
    action: 'BUG_REPORT_TRIAGED' | 'BUG_REPORT_HELD',
    report: BugReportTriageRecord,
    redacted: RedactedBugReport,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: BUG_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      metadata: {
        reference: report.reference,
        reporterRole: report.reporterRole,
        sentFields: Object.keys(redacted),
        sentLengths: measureSentLengths(redacted),
        ...extra,
      },
    });
  }

  private isStale(report: BugReportTriageRecord): boolean {
    return Date.now() - report.createdAt.getTime() >= this.triageConfig.staleAfterMs;
  }

  private requireProviderKind(): NonNullable<BugReportTriageConfig['providerKind']> {
    const providerKind = this.triageConfig.providerKind;
    if (providerKind === null) {
      throw new Error('Bug triage provider is not configured');
    }
    return providerKind;
  }

  private resolveBaseUrl(): string {
    const configured =
      this.triageConfig.baseUrl ?? DEFAULT_AI_PROVIDER_BASE_URLS[this.requireProviderKind()];
    if (configured === null) {
      throw new Error(
        `Bug triage provider kind ${this.requireProviderKind()} requires BUG_TRIAGE_AI_BASE_URL`,
      );
    }
    return configured.replace(/\/+$/, '');
  }
}

/** The forced tool's parameters, inlined so every provider reads one document. */
function buildToolParameters(): Record<string, unknown> {
  const { $schema, ...parameters } = zodToJsonSchema(fileBugTicketSchema, {
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  void $schema;
  return parameters;
}

/** Character counts per sent field, for the audit row. */
function measureSentLengths(redacted: RedactedBugReport): Record<string, number> {
  return Object.fromEntries(
    Object.entries(redacted).map(([field, value]) => [field, value?.length ?? 0]),
  );
}

/**
 * A failure reason short enough for a column and safe enough for a log: the
 * typed code where there is one, the class name otherwise. Never the message —
 * an upstream message can quote the payload, and the payload is a bug report.
 */
function describeTriageError(caughtError: unknown): string {
  if (caughtError instanceof Error && 'code' in caughtError) {
    return String((caughtError as { code: unknown }).code);
  }
  return caughtError instanceof Error ? caughtError.name : 'UnknownError';
}
