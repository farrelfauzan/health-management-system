import { Injectable } from '@nestjs/common';
import {
  BugReportPublishRecord,
  BugReportQuota,
  BugReportRecord,
  BugReportTriageRecord,
  ClaimBugReportsPayload,
  CreateBugReportData,
  fileBugTicketSchema,
  RescheduleBugReportAttemptData,
  SettleBugReportFailedData,
  SettleBugReportHeldData,
  SettleBugReportPublishedData,
  SettleBugReportTriagedData,
} from '@hms/shared-types';

import { BugReportStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BugReportPurgeCutoffs } from '../bug-report-triage.types';

/**
 * The advisory-lock namespace for the per-reporter daily limit, distinct from
 * the chat quotas' namespaces so the two never block each other for one user.
 */
const BUG_REPORT_QUOTA_LOCK_NAMESPACE = 3;

/**
 * The single counter row's key. A sentinel rather than a real facility id: this
 * product serves one clinic per deployment, and the migration seeds exactly
 * this row.
 */
const SINGLE_DEPLOYMENT_ID = '00000000-0000-0000-0000-000000000000';

const BUG_REPORT_REFERENCE_PREFIX = 'BR-';

const BUG_REPORT_REFERENCE_WIDTH = 6;

/**
 * The row shape every read projects, so a column added later cannot leak
 * through a `select`-less read.
 *
 * The free-text columns are absent on purpose: intake answers with a reference
 * and a status, and the only consumer that needs the report's words is the
 * triage worker, which will project them explicitly (P23-T09).
 */
const BUG_REPORT_SELECT = {
  id: true,
  reference: true,
  status: true,
  createdAt: true,
} satisfies Prisma.BugReportSelect;

type BugReportRow = Prisma.BugReportGetPayload<{ select: typeof BUG_REPORT_SELECT }>;

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * What replaces the reporter's words once retention expires.
 *
 * A marker rather than an empty string, so a purged row reads as purged in the
 * one place anybody looks at these columns — a `psql` session while working out
 * why a ticket has no detail.
 */
const PURGED_TEXT_PLACEHOLDER = '[purged]';

/**
 * The triage worker's projection: the report's words, plus the reporter id the
 * HELD notification is addressed to (P23-T09).
 *
 * The one `select` in this file that returns free text. Keeping it separate from
 * `BUG_REPORT_SELECT` is what lets a reviewer answer "who reads the report" by
 * grepping for this constant.
 */
const BUG_REPORT_TRIAGE_SELECT = {
  id: true,
  reference: true,
  reporterUserId: true,
  reporterRole: true,
  title: true,
  description: true,
  stepsToReproduce: true,
  expected: true,
  actual: true,
  pagePath: true,
  requestIds: true,
  appVersion: true,
  attemptCount: true,
  createdAt: true,
} satisfies Prisma.BugReportSelect;

type BugReportTriageRow = Prisma.BugReportGetPayload<{
  select: typeof BUG_REPORT_TRIAGE_SELECT;
}>;

/**
 * The publisher's projection (P23-T10): ticket content and metadata, and no
 * unredacted text at all — `redactedText` is already redacted, and is the ticket
 * body for a FALLBACK row.
 */
const BUG_REPORT_PUBLISH_SELECT = {
  id: true,
  reference: true,
  reporterRole: true,
  triage: true,
  triagedBy: true,
  redactedText: true,
  pagePath: true,
  requestIds: true,
  appVersion: true,
  attemptCount: true,
  notionPageId: true,
  createdAt: true,
} satisfies Prisma.BugReportSelect;

type BugReportPublishRow = Prisma.BugReportGetPayload<{
  select: typeof BUG_REPORT_PUBLISH_SELECT;
}>;

type ClaimedRow = { id: string };

type ReferenceAllocationRow = { allocated: bigint };

@Injectable()
export class BugReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores a report, but only if the reporter's daily limit still has room.
   *
   * Lock, count, insert, all in one transaction — the discipline
   * `createSessionWithinQuota` uses, for the reason measured there: counting
   * and inserting as two statements is not a limit, because concurrent
   * requests all read the same count before any of them writes. The advisory
   * lock is keyed on the reporter, so two people filing at once never wait on
   * each other.
   *
   * Returns `null` rather than throwing when the limit is reached. The
   * repository does not know what HTTP status a full quota deserves, and the
   * service does; keeping domain errors out of here is what lets the worker
   * reuse these methods later without catching HTTP exceptions.
   *
   * The reference is allocated inside the same transaction, so a rolled-back
   * insert never burns a number.
   */
  async createWithinQuota(
    data: CreateBugReportData,
    quota: BugReportQuota,
  ): Promise<BugReportRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.reporterUserId}), ${BUG_REPORT_QUOTA_LOCK_NAMESPACE})`;
      const filedInWindow = await transaction.bugReport.count({
        where: { reporterUserId: data.reporterUserId, createdAt: { gte: quota.since } },
      });
      if (filedInWindow >= quota.limit) {
        return null;
      }
      const reference = await this.allocateReference(transaction);
      const row = await transaction.bugReport.create({
        data: {
          reference,
          reporterUserId: data.reporterUserId,
          reporterRole: data.reporterRole,
          title: data.title,
          description: data.description,
          stepsToReproduce: data.stepsToReproduce ?? null,
          expected: data.expected ?? null,
          actual: data.actual ?? null,
          pagePath: data.pagePath,
          requestIds: [...data.requestIds],
          userAgent: data.userAgent,
          appVersion: data.appVersion ?? null,
          acknowledgedNoSensitiveDataAt: data.acknowledgedNoSensitiveDataAt,
        },
        select: BUG_REPORT_SELECT,
      });
      return toBugReportRecord(row);
    });
  }

  /**
   * Takes the next `BR-` number under the row lock the `UPDATE` itself holds.
   *
   * Never `MAX(reference) + 1`: that races, and two reports sharing a reference
   * would collide on the unique index at best and be mistaken for one ticket at
   * worst. A missing counter row is an error rather than an implicit insert —
   * the migration seeds it, and creating it here would race precisely when two
   * deployments' first reports arrive together.
   */
  private async allocateReference(transaction: Prisma.TransactionClient): Promise<string> {
    const rows = await transaction.$queryRaw<ReferenceAllocationRow[]>`
      UPDATE "bug_report_counters"
         SET "next_value" = "next_value" + 1,
             "updated_at" = NOW()
       WHERE "id" = ${SINGLE_DEPLOYMENT_ID}::uuid
      RETURNING "next_value" - 1 AS "allocated"
    `;
    const allocated = rows[0]?.allocated;
    if (allocated === undefined) {
      throw new Error(
        'Bug report counter row is missing: run database migrations before accepting reports',
      );
    }
    return `${BUG_REPORT_REFERENCE_PREFIX}${String(allocated).padStart(BUG_REPORT_REFERENCE_WIDTH, '0')}`;
  }

  /** How many reports this person has filed since `since` — the limit's input. */
  async countFiledSince(reporterUserId: string, since: Date): Promise<number> {
    return this.prisma.bugReport.count({
      where: { reporterUserId, createdAt: { gte: since } },
    });
  }

  /**
   * The reporter's current role code, for freezing onto the report.
   *
   * Its own narrow read rather than the auth repository's `findUserById`, which
   * loads every role with every permission: this needs one code, and pulling
   * the auth module in to get it would couple bug reporting to the login path.
   *
   * Live assignments only, matching the guard's own predicate — a role that was
   * unassigned or soft-deleted must not be the label a new report carries.
   */
  async findReporterRoleCode(reporterUserId: string): Promise<string | null> {
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId: reporterUserId,
        deletedAt: null,
        unassignedAt: null,
        role: { deletedAt: null },
      },
      orderBy: { assignedAt: 'asc' },
      select: { role: { select: { code: true } } },
    });
    return assignment?.role.code ?? null;
  }

  /**
   * Claims up to `limit` due rows in one status for exactly one worker replica
   * (P23-T09, P23-T10).
   *
   * Selecting and updating in one statement under `FOR UPDATE SKIP LOCKED` is
   * what makes two replicas safe: each row goes to one claimer, so a report is
   * never triaged twice — and, more importantly, never published twice, because
   * Notion page creation is not idempotent.
   *
   * The lease is `leased_until`, not a status change. A worker that dies
   * mid-report releases its rows when the lease lapses, with no reaper and no
   * half-processed state to reconcile. Oldest due first, so a report that came
   * due while the vendor was down is not queued behind reports filed since.
   */
  async claimDueReports(payload: ClaimBugReportsPayload): Promise<string[]> {
    const leaseSeconds = payload.leaseMs / MILLISECONDS_PER_SECOND;
    const claimed = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "bug_reports"
      SET "leased_until" = now() + make_interval(secs => ${leaseSeconds}::double precision),
          "leased_by" = ${payload.leasedBy},
          "updated_at" = now()
      WHERE "id" IN (
        SELECT "id"
        FROM "bug_reports"
        WHERE "status" = ${payload.status}::"bug_report_status"
          AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now())
          AND ("leased_until" IS NULL OR "leased_until" <= now())
        ORDER BY COALESCE("next_attempt_at", "created_at") ASC
        LIMIT ${payload.limit}::integer
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `;
    return claimed.map((row) => row.id);
  }

  /**
   * The triage worker's own projection — the only read that returns the
   * reporter's free text.
   *
   * Its own method rather than a widened `BUG_REPORT_SELECT`, so "what can see
   * the report's words" stays a question with one answer. `reporterUserId` is
   * included solely to address the HELD notification; nothing downstream of here
   * carries it (§5c, "the reporter's identity").
   */
  async findForTriage(ids: readonly string[]): Promise<BugReportTriageRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.bugReport.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { createdAt: 'asc' },
      select: BUG_REPORT_TRIAGE_SELECT,
    });
    return rows.map(toBugReportTriageRecord);
  }

  /**
   * The publisher's projection (P23-T10): the AI's ticket content, never the
   * reporter's original text — except the already-redacted fallback body, which
   * *is* the ticket when no model wrote one.
   */
  async findForPublish(ids: readonly string[]): Promise<BugReportPublishRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.bugReport.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { createdAt: 'asc' },
      select: BUG_REPORT_PUBLISH_SELECT,
    });
    return rows.map(toBugReportPublishRecord);
  }

  /** Settles a report as triaged and releases the lease so publishing can claim it. */
  async markTriaged(data: SettleBugReportTriagedData): Promise<void> {
    await this.prisma.bugReport.update({
      where: { id: data.id },
      data: {
        status: BugReportStatus.TRIAGED,
        triage: data.triage === null ? Prisma.DbNull : (data.triage as Prisma.InputJsonValue),
        triagedBy: data.triagedBy,
        redactedText: data.redactedText,
        attemptCount: { increment: 1 },
        lastError: null,
        // Reset, not merely released: the attempt counter and backoff are shared
        // with the publish step, and a report that used three triage attempts
        // must still get its full allowance of publish attempts.
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /** Settles a report as held. Terminal: nothing claims a HELD row again. */
  async markHeld(data: SettleBugReportHeldData): Promise<void> {
    await this.prisma.bugReport.update({
      where: { id: data.id },
      data: {
        status: BugReportStatus.HELD,
        heldAt: data.heldAt,
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /** A transient failure: count the attempt, record why, park the row. */
  async rescheduleAttempt(data: RescheduleBugReportAttemptData): Promise<void> {
    await this.prisma.bugReport.update({
      where: { id: data.id },
      data: {
        attemptCount: { increment: 1 },
        lastError: data.error,
        nextAttemptAt: data.nextAttemptAt,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /**
   * Releases a claimed row without counting an attempt (P23-T10).
   *
   * For the case the ticket is explicit about: the Notion connector is not
   * configured, so nothing was tried. Counting an attempt here would burn a
   * report's whole allowance against a deployment that simply has no board yet,
   * and it would reach `FAILED` having never been sent anywhere.
   */
  async releaseClaim(id: string): Promise<void> {
    await this.prisma.bugReport.update({
      where: { id },
      data: { leasedUntil: null, leasedBy: null },
    });
  }

  /** A report reached the Bug Board (P23-T10). */
  async markPublished(data: SettleBugReportPublishedData): Promise<void> {
    await this.prisma.bugReport.update({
      where: { id: data.id },
      data: {
        status: BugReportStatus.PUBLISHED,
        notionPageId: data.notionPageId,
        notionPageUrl: data.notionPageUrl,
        publishedAt: data.publishedAt,
        attemptCount: { increment: 1 },
        lastError: null,
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /** A permanent publish failure: the error code only, never an upstream message. */
  async markFailed(data: SettleBugReportFailedData): Promise<void> {
    await this.prisma.bugReport.update({
      where: { id: data.id },
      data: {
        status: BugReportStatus.FAILED,
        lastError: data.error,
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        leasedUntil: null,
        leasedBy: null,
      },
    });
  }

  /**
   * Records the page an `AMBIGUOUS` retry found rather than created (P23-T10).
   *
   * Its own method so the "we adopted an existing page" path cannot be confused
   * with the "we created one" path in a log or a test — they produce the same
   * row and mean different things about how close the board came to holding two
   * tickets for one report.
   */
  async adoptExistingPage(data: SettleBugReportPublishedData): Promise<void> {
    await this.markPublished(data);
  }

  /**
   * When a report last reached the Bug Board, for the integrations card
   * (P23-T10).
   *
   * `null` means none ever has, which on a configured deployment is exactly the
   * state worth seeing: it is the difference between "the connector is set up"
   * and "the pipeline works", and nothing else on that card can tell them apart.
   */
  async findLastPublishedAt(): Promise<Date | null> {
    const row = await this.prisma.bugReport.findFirst({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    });
    return row?.publishedAt ?? null;
  }

  /**
   * Purges the unredacted free text on the §5c schedule.
   *
   * Overwrites rather than nulls: the columns are `NOT NULL` on a table whose
   * rows are the audit trail of what was reported, and a row that loses its
   * title reads as a corrupt record rather than as a purged one.
   * `content_purged_at` is what makes a purge that never ran visible.
   */
  async purgeExpiredContent(cutoffs: BugReportPurgeCutoffs): Promise<number> {
    const result = await this.prisma.bugReport.updateMany({
      where: {
        contentPurgedAt: null,
        OR: [
          { status: BugReportStatus.PUBLISHED, publishedAt: { lte: cutoffs.publishedBefore } },
          { status: BugReportStatus.HELD, heldAt: { lte: cutoffs.heldBefore } },
        ],
      },
      data: {
        title: PURGED_TEXT_PLACEHOLDER,
        description: PURGED_TEXT_PLACEHOLDER,
        stepsToReproduce: null,
        expected: null,
        actual: null,
        redactedText: null,
        contentPurgedAt: new Date(),
      },
    });
    return result.count;
  }
}

/**
 * Maps a row to the record callers see.
 *
 * Field by field rather than a spread, so a column added to the table has to be
 * named here before it can reach a caller — which is the point of the
 * projection in a table whose other columns are the reporter's free text.
 */
function toBugReportRecord(row: BugReportRow): BugReportRecord {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function toBugReportTriageRecord(row: BugReportTriageRow): BugReportTriageRecord {
  return {
    id: row.id,
    reference: row.reference,
    reporterUserId: row.reporterUserId,
    reporterRole: row.reporterRole,
    title: row.title,
    description: row.description,
    stepsToReproduce: row.stepsToReproduce,
    expected: row.expected,
    actual: row.actual,
    pagePath: row.pagePath,
    requestIds: row.requestIds,
    appVersion: row.appVersion,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
  };
}

/**
 * Maps a publish row, parsing the stored triage JSON back through the schema.
 *
 * Parsed rather than cast: the column is `Json`, so what comes back is whatever
 * was written — including by an older deployment whose tool schema had one field
 * fewer. A row that no longer validates yields `null`, which the publisher reads
 * as "no AI content" and falls back to the redacted text, rather than mapping
 * `undefined` onto a Notion select and failing the whole page.
 */
function toBugReportPublishRecord(row: BugReportPublishRow): BugReportPublishRecord {
  const parsedTriage = fileBugTicketSchema.safeParse(row.triage);
  return {
    id: row.id,
    reference: row.reference,
    reporterRole: row.reporterRole,
    triage: parsedTriage.success ? parsedTriage.data : null,
    triagedBy: row.triagedBy ?? 'FALLBACK',
    redactedText: row.redactedText,
    pagePath: row.pagePath,
    requestIds: row.requestIds,
    appVersion: row.appVersion,
    attemptCount: row.attemptCount,
    notionPageId: row.notionPageId,
    createdAt: row.createdAt,
  };
}
