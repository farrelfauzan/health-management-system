import { Injectable } from '@nestjs/common';
import type {
  AnalyticsLaboratoryBucketRow,
  AnalyticsLaboratorySnapshot,
  AnalyticsLaboratorySourceRow,
  AnalyticsLaboratoryTestRow,
  AnalyticsLaboratoryTotalsRow,
  AnalyticsSqlScope,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { AnalyticsQueryRepository } from './analytics-query.repository';

// The tests ordered most (PRD FR-LAB-03).
const TOP_TESTS = 10;

/**
 * The laboratory dashboard's reads (P29-T14, PRD FR-LAB-01 to 04), over the
 * lab order, order line and test tables (D-049). Every order has a
 * registration, a walk-in's included, so poli and payer narrow through it;
 * the clinician is the one who ordered it, and an external referral or a
 * walk-in has none.
 */
@Injectable()
export class AnalyticsLaboratoryRepository {
  constructor(private readonly analyticsQueryRepository: AnalyticsQueryRepository) {}

  /** Every laboratory figure for one period, in one read-only transaction. */
  readSnapshot(scope: AnalyticsSqlScope): Promise<AnalyticsLaboratorySnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      totals: await this.readTotals(tx, scope),
      buckets: await this.listBuckets(tx, scope),
      sources: await this.listSources(tx, scope),
      tests: await this.listTopTests(tx, scope),
    }));
  }

  /**
   * Orders placed in the range, with the minutes from order to release for
   * those released. A release stamped before its order is a clock error and
   * has no turnaround.
   */
  private withPlaced(scope: AnalyticsSqlScope): Prisma.Sql {
    const doctorFilter = scope.doctorId
      ? Prisma.sql`AND lo."ordered_by_id" = ${scope.doctorId}::uuid`
      : Prisma.empty;
    const poliFilter = scope.specialtyId
      ? Prisma.sql`AND r."specialty_id" = ${scope.specialtyId}::uuid`
      : Prisma.empty;
    const payerFilter = scope.payerType
      ? Prisma.sql`AND r."payer_type" = ${scope.payerType}::payer_type`
      : Prisma.empty;
    return Prisma.sql`WITH placed AS (
      SELECT lo."id", lo."status", lo."fulfilment_site", lo."source", lo."recollect_count",
             lo."ordered_at",
             CASE
               WHEN lo."status" = 'RELEASED' AND lo."released_at" >= lo."ordered_at"
                 THEN extract(epoch FROM lo."released_at" - lo."ordered_at") / 60
             END AS "minutes"
      FROM "lab_orders" lo
      JOIN "registrations" r ON r."id" = lo."registration_id"
      WHERE lo."ordered_at" >= ${scope.startUtc}::timestamp
        AND lo."ordered_at" < ${scope.endUtc}::timestamp
        ${doctorFilter} ${poliFilter} ${payerFilter}
    )`;
  }

  /**
   * The four outcomes, recollections and turnaround. An order run by an
   * outside lab is never released here, so it is `sentOut` rather than
   * waiting, and it is left out of recollections: no sample was taken here.
   */
  private async readTotals(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsLaboratoryTotalsRow> {
    const rows = await tx.$queryRaw<AnalyticsLaboratoryTotalsRow[]>`
      ${this.withPlaced(scope)}
      SELECT count(*)::int AS "orders",
             count(*) FILTER (WHERE "status" = 'RELEASED')::int AS "released",
             count(*) FILTER (
               WHERE "status" NOT IN ('RELEASED', 'CANCELLED')
                 AND "fulfilment_site" = 'INTERNAL')::int AS "inProgress",
             count(*) FILTER (
               WHERE "status" NOT IN ('RELEASED', 'CANCELLED')
                 AND "fulfilment_site" = 'EXTERNAL')::int AS "sentOut",
             count(*) FILTER (WHERE "status" = 'CANCELLED')::int AS "cancelled",
             count(*) FILTER (
               WHERE "recollect_count" > 0 AND "fulfilment_site" = 'INTERNAL')::int
               AS "recollectedOrders",
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY "minutes"))::float8
               AS "medianTurnaroundMinutes",
             (percentile_cont(0.9) WITHIN GROUP (ORDER BY "minutes"))::float8
               AS "p90TurnaroundMinutes"
      FROM placed`;
    return (
      rows[0] ?? {
        orders: 0,
        released: 0,
        inProgress: 0,
        sentOut: 0,
        cancelled: 0,
        recollectedOrders: 0,
        medianTurnaroundMinutes: null,
        p90TurnaroundMinutes: null,
      }
    );
  }

  private listBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsLaboratoryBucketRow[]> {
    return tx.$queryRaw<AnalyticsLaboratoryBucketRow[]>`
      ${this.withPlaced(scope)}
      SELECT to_char(
               date_trunc(${scope.granularity}, ("ordered_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}),
               'YYYY-MM-DD') AS "bucket",
             count(*)::int AS "orders",
             count(*) FILTER (WHERE "status" = 'RELEASED')::int AS "released"
      FROM placed
      GROUP BY 1`;
  }

  private listSources(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsLaboratorySourceRow[]> {
    return tx.$queryRaw<AnalyticsLaboratorySourceRow[]>`
      ${this.withPlaced(scope)}
      SELECT "source"::text AS "source", count(*)::int AS "orders"
      FROM placed
      GROUP BY 1`;
  }

  /**
   * The tests on the most orders that were not cancelled, each with the
   * turnaround of the orders it was on. A test cancelled off an order does
   * not count for it.
   */
  private listTopTests(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsLaboratoryTestRow[]> {
    return tx.$queryRaw<AnalyticsLaboratoryTestRow[]>`
      ${this.withPlaced(scope)}
      SELECT t."id"::text AS "labTestId", t."code", t."name",
             count(*)::int AS "orders",
             count(p."minutes")::int AS "releasedOrders",
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY p."minutes"))::float8
               AS "medianTurnaroundMinutes",
             (percentile_cont(0.9) WITHIN GROUP (ORDER BY p."minutes"))::float8
               AS "p90TurnaroundMinutes"
      FROM placed p
      JOIN "lab_order_items" i ON i."lab_order_id" = p."id" AND i."status" <> 'CANCELLED'
      JOIN "lab_tests" t ON t."id" = i."lab_test_id"
      WHERE p."status" <> 'CANCELLED'
      GROUP BY t."id"
      ORDER BY "orders" DESC, t."name"
      LIMIT ${TOP_TESTS}`;
  }
}
