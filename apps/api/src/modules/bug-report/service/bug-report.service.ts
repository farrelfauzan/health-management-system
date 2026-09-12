import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BugReportFieldLengths,
  BugReportSubmissionView,
  BUG_REPORT_TEXT_FIELDS,
  CreateBugReportInput,
  createBugReportSchemaWith,
  SENSITIVE_DATA_DETECTED,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { resolveMrnConfig } from '../../../common/mrn/mrn.config';
import { MrnConfig } from '../../../common/mrn/mrn.types';
import { BugReportRepository } from '../repository/bug-report.repository';

/**
 * The audit resource these entries hang off. A constant because two actions
 * share it and a typo in one would silently split the trail in two.
 */
const BUG_REPORT_AUDIT_RESOURCE = 'BugReport';

const HOURS_PER_DAY = 24;

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * How many reports one person may file per rolling day.
 *
 * A cap on accident and abuse, not on diligence: ten is far above what a
 * working day of genuine problems produces, and the reporter who hits it is
 * either scripting or stuck in a loop. Counted in the database because this
 * repo has no throttler, and a per-process counter would multiply by the
 * number of replicas.
 */
const MAX_REPORTS_PER_DAY = 10;

/**
 * The label a report carries when the reporter holds no live role assignment.
 *
 * A word rather than an empty string, because it is displayed on the Bug Board
 * and a blank cell there reads as a broken publisher rather than as a fact about
 * the account. Reaching this means the permission guard let someone through on a
 * grant that outlived its role, which is worth seeing on the board.
 */
const UNKNOWN_REPORTER_ROLE = 'UNKNOWN';

@Injectable()
export class BugReportService {
  private readonly mrnConfig: MrnConfig;

  constructor(
    private readonly bugReportRepository: BugReportRepository,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.mrnConfig = resolveMrnConfig(configService);
  }

  /**
   * Accepts a report, or refuses it for the two reasons intake knows about:
   * sensitive data, and too many reports today.
   *
   * The sensitive-data rules run here rather than being left to the global
   * validation pipe, for two reasons that point the same way. The MRN rule
   * needs this deployment's prefix and width, which only the server has; and
   * the pipe reports a custom issue as a generic `BAD_REQUEST` with the real
   * reason buried in `errors[].params`, whereas the dialog has to branch on
   * `SENSITIVE_DATA_DETECTED` to put the message on the right field. Running
   * the schema here gives one validation site and one error shape.
   */
  async submitReport(
    payload: CreateBugReportInput,
    actor: CurrentUser,
    userAgent: string,
  ): Promise<BugReportSubmissionView> {
    const reporterRole =
      (await this.bugReportRepository.findReporterRoleCode(actor.sub)) ?? UNKNOWN_REPORTER_ROLE;
    const checkedPayload = await this.assertNoSensitiveData(payload, actor, reporterRole);
    const record = await this.bugReportRepository.createWithinQuota(
      {
        reporterUserId: actor.sub,
        reporterRole,
        title: checkedPayload.title,
        description: checkedPayload.description,
        stepsToReproduce: checkedPayload.stepsToReproduce,
        expected: checkedPayload.expected,
        actual: checkedPayload.actual,
        pagePath: checkedPayload.pagePath,
        requestIds: checkedPayload.requestIds,
        userAgent,
        appVersion: checkedPayload.appVersion,
        acknowledgedNoSensitiveDataAt: new Date(),
      },
      { since: new Date(Date.now() - HOURS_PER_DAY * MILLISECONDS_PER_HOUR), limit: MAX_REPORTS_PER_DAY },
    );
    if (record === null) {
      throw buildDailyLimitError();
    }
    await this.auditService.record({
      action: 'BUG_REPORT_SUBMITTED',
      resource: BUG_REPORT_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: {
        reference: record.reference,
        reporterRole,
        ...measureFieldLengths(checkedPayload),
      },
    });
    return { reference: record.reference, status: record.status };
  }

  /**
   * Re-runs the P23-T07 rules with the MRN format the browser does not know,
   * and refuses the report naming the field and the category.
   *
   * The audit entry records the category and nothing else. Writing the offending
   * text into the audit trail would move it into a table with a longer retention
   * rule than the report it was refused from — the block would become the leak.
   */
  private async assertNoSensitiveData(
    payload: CreateBugReportInput,
    actor: CurrentUser,
    reporterRole: string,
  ): Promise<CreateBugReportInput> {
    const result = createBugReportSchemaWith({
      mrnFormat: { prefix: this.mrnConfig.prefix, width: this.mrnConfig.width },
    }).safeParse(payload);
    if (result.success) {
      return result.data;
    }
    const sensitiveIssue = result.error.issues.find(
      (issue) => issue.code === 'custom' && issue.params?.code === SENSITIVE_DATA_DETECTED,
    );
    if (!sensitiveIssue) {
      throw new BadRequestException({ message: 'Validation failed', errors: result.error.issues });
    }
    const field = String(sensitiveIssue.path[0] ?? '');
    const category =
      sensitiveIssue.code === 'custom' ? String(sensitiveIssue.params?.category ?? '') : '';
    await this.auditService.record({
      action: 'BUG_REPORT_REJECTED_SENSITIVE',
      resource: BUG_REPORT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { reporterRole, field, category },
    });
    throw new BadRequestException({
      code: SENSITIVE_DATA_DETECTED,
      message: sensitiveIssue.message,
      errors: [{ path: [field], category }],
    });
  }
}

/**
 * Counts the characters in each free-text field, for an audit entry that shows
 * a report was filed and roughly how much was written — and never what.
 */
function measureFieldLengths(payload: CreateBugReportInput): BugReportFieldLengths {
  const lengths: Record<string, number> = {};
  for (const field of BUG_REPORT_TEXT_FIELDS) {
    const value = payload[field];
    if (value !== undefined) {
      lengths[`${field}Length`] = value.length;
    }
  }
  return lengths;
}

/**
 * The 429 a reporter meets after ten reports in a rolling day.
 *
 * Carries `retryAfterSeconds` so a client can say when to try again rather than
 * leaving the reporter to guess, matching the login throttle's shape.
 */
function buildDailyLimitError(): HttpException {
  return new HttpException(
    {
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: `You can file up to ${MAX_REPORTS_PER_DAY} bug reports per day. Try again later.`,
        details: { retryAfterSeconds: HOURS_PER_DAY * (MILLISECONDS_PER_HOUR / 1000) },
      },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
