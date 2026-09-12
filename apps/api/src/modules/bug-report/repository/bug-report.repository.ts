import { Injectable } from '@nestjs/common';
import { BugReportQuota, BugReportRecord, CreateBugReportData } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

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
