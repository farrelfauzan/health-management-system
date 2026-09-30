import { Injectable } from '@nestjs/common';
import type {
  AnalyticsMedicationRevenueBucketRow,
  AnalyticsPharmacyBucketRow,
  AnalyticsPharmacyExpiryRow,
  AnalyticsPharmacyMedicationRow,
  AnalyticsPharmacyReorderRow,
  AnalyticsPharmacySnapshot,
  AnalyticsPharmacyStockSnapshot,
  AnalyticsPharmacyTotalsRow,
  AnalyticsSqlScope,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { ANALYTICS_INVOICE_VISIT_JOINS } from './analytics-invoice-visit-joins';
import { AnalyticsQueryRepository } from './analytics-query.repository';
import { buildAnalyticsInvoiceRevenueFilter } from './build-analytics-invoice-revenue-filter';

// Top medications by units handed over (PRD FR-PHR-02).
const TOP_MEDICATIONS = 20;
// The window behind a medication's average daily use (PRD FR-PHR-05).
const USAGE_WINDOW_DAYS = 30;
// The expiry windows, in days from today (PRD FR-PHR-03).
const FIRST_EXPIRY_DAYS = 30;
const SECOND_EXPIRY_DAYS = 60;
const THIRD_EXPIRY_DAYS = 90;

/** Joins a prescription aliased `p` to the visit it was written in, aliased `r`. */
const PRESCRIPTION_VISIT_JOINS = Prisma.sql`LEFT JOIN "encounters" e ON e."id" = p."encounter_id"
  LEFT JOIN "registrations" r ON r."id" = e."registration_id"`;

/**
 * The pharmacy dashboard's reads (P29-T13, PRD FR-PHR-01 to 05), over the
 * prescription, dispense, stock and invoice tables (D-049). A prescription
 * is narrowed by its own prescriber, and by the poli and payer of the visit
 * it was written in; one written between visits matches no poli or payer.
 */
@Injectable()
export class AnalyticsPharmacyRepository {
  constructor(private readonly analyticsQueryRepository: AnalyticsQueryRepository) {}

  /** Every figure that follows the period, in one read-only transaction. */
  readSnapshot(scope: AnalyticsSqlScope): Promise<AnalyticsPharmacySnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      totals: await this.readTotals(tx, scope),
      buckets: await this.listBuckets(tx, scope),
      revenueBuckets: await this.listRevenueBuckets(tx, scope),
      medications: await this.listTopMedications(tx, scope),
    }));
  }

  /**
   * Stock health as of now in the clinic's time zone, clinic wide: stock has
   * no period, poli or prescriber.
   */
  readStock(timeZone: string): Promise<AnalyticsPharmacyStockSnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      asOfDate: await this.readClinicToday(tx, timeZone),
      reorder: await this.listReorder(tx, timeZone),
      expiry: await this.listExpiry(tx, timeZone),
    }));
  }

  /** Prescriber, poli and payer, for a prescription `p` joined to its visit `r`. */
  private buildNarrowing(scope: AnalyticsSqlScope): Prisma.Sql {
    const doctorFilter = scope.doctorId
      ? Prisma.sql`AND p."doctor_id" = ${scope.doctorId}::uuid`
      : Prisma.empty;
    const poliFilter = scope.specialtyId
      ? Prisma.sql`AND r."specialty_id" = ${scope.specialtyId}::uuid`
      : Prisma.empty;
    const payerFilter = scope.payerType
      ? Prisma.sql`AND r."payer_type" = ${scope.payerType}::payer_type`
      : Prisma.empty;
    return Prisma.sql`${doctorFilter} ${poliFilter} ${payerFilter}`;
  }

  /** Prescriptions issued in the range, with the status they have now. A draft was never issued. */
  private withIssued(scope: AnalyticsSqlScope): Prisma.Sql {
    return Prisma.sql`WITH issued AS (
      SELECT p."id", p."status", p."fulfilment_site", p."issued_at"
      FROM "prescriptions" p
      ${PRESCRIPTION_VISIT_JOINS}
      WHERE p."deleted_at" IS NULL
        AND p."status" <> 'DRAFT'
        AND p."issued_at" >= ${scope.startUtc}::timestamp
        AND p."issued_at" < ${scope.endUtc}::timestamp
        ${this.buildNarrowing(scope)}
    )`;
  }

  private buildBucket(scope: AnalyticsSqlScope, column: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`to_char(
      date_trunc(${scope.granularity}, (${column} AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}),
      'YYYY-MM-DD')`;
  }

  /**
   * The five outcomes of the period's prescriptions, and the median minutes
   * from issue to the first dispense that was not cancelled. A dispense
   * stamped before its issue is a clock error and is left out.
   */
  private async readTotals(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPharmacyTotalsRow> {
    const rows = await tx.$queryRaw<AnalyticsPharmacyTotalsRow[]>`
      ${this.withIssued(scope)},
      first_dispense AS (
        SELECT extract(epoch FROM min(d."dispensed_at") - i."issued_at") / 60 AS "minutes"
        FROM issued i
        JOIN "dispense_records" d ON d."prescription_id" = i."id" AND d."status" = 'DISPENSED'
        GROUP BY i."id", i."issued_at"
      )
      SELECT count(*)::int AS "prescriptionsIssued",
             count(*) FILTER (WHERE "status" = 'DISPENSED')::int AS "fullyDispensed",
             count(*) FILTER (WHERE "status" = 'PARTIALLY_DISPENSED')::int AS "partiallyDispensed",
             count(*) FILTER (WHERE "status" = 'CANCELLED')::int AS "cancelled",
             count(*) FILTER (
               WHERE "status" = 'ISSUED' AND "fulfilment_site" = 'INTERNAL')::int AS "awaitingDispense",
             count(*) FILTER (
               WHERE "status" = 'ISSUED' AND "fulfilment_site" = 'EXTERNAL')::int AS "filledElsewhere",
             (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "minutes")
              FROM first_dispense WHERE "minutes" >= 0)::float8 AS "medianDispenseMinutes"
      FROM issued`;
    return (
      rows[0] ?? {
        prescriptionsIssued: 0,
        fullyDispensed: 0,
        partiallyDispensed: 0,
        cancelled: 0,
        awaitingDispense: 0,
        filledElsewhere: 0,
        medianDispenseMinutes: null,
      }
    );
  }

  private listBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPharmacyBucketRow[]> {
    return tx.$queryRaw<AnalyticsPharmacyBucketRow[]>`
      ${this.withIssued(scope)}
      SELECT ${this.buildBucket(scope, Prisma.sql`"issued_at"`)} AS "bucket",
             count(*)::int AS "prescriptionsIssued",
             count(*) FILTER (WHERE "status" = 'DISPENSED')::int AS "fullyDispensed"
      FROM issued
      GROUP BY 1`;
  }

  /** Medication lines of the invoices that count as revenue, by invoice date (Q-3). */
  private listRevenueBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsMedicationRevenueBucketRow[]> {
    return tx.$queryRaw<AnalyticsMedicationRevenueBucketRow[]>`
      SELECT ${this.buildBucket(scope, Prisma.sql`i."issued_at"`)} AS "bucket",
             (COALESCE(sum(it."amount"), 0) * 100)::float8 AS "amountCents"
      FROM "invoice_items" it
      JOIN "invoices" i ON i."id" = it."invoice_id"
      ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE it."item_type" = 'MEDICATION'
        AND ${buildAnalyticsInvoiceRevenueFilter(scope)}
      GROUP BY 1`;
  }

  /** Units handed over in the range, by catalog medication; compounds have none and are not ranked. */
  private listTopMedications(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPharmacyMedicationRow[]> {
    return tx.$queryRaw<AnalyticsPharmacyMedicationRow[]>`
      SELECT m."id"::text AS "medicationId", m."code", m."name", m."strength",
             m."unit"::text AS "unit",
             sum(di."quantity")::int AS "quantity",
             count(DISTINCT d."id")::int AS "dispenses"
      FROM "dispense_items" di
      JOIN "dispense_records" d ON d."id" = di."dispense_record_id" AND d."status" = 'DISPENSED'
      JOIN "prescriptions" p ON p."id" = d."prescription_id"
      JOIN "medications" m ON m."id" = di."medication_id"
      ${PRESCRIPTION_VISIT_JOINS}
      WHERE p."deleted_at" IS NULL
        AND d."dispensed_at" >= ${scope.startUtc}::timestamp
        AND d."dispensed_at" < ${scope.endUtc}::timestamp
        ${this.buildNarrowing(scope)}
      GROUP BY m."id"
      ORDER BY "quantity" DESC, m."name"
      LIMIT ${TOP_MEDICATIONS}`;
  }

  private async readClinicToday(tx: PrismaTransactionClient, timeZone: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ asOfDate: string }>>`
      SELECT to_char((now() AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS "asOfDate"`;
    return rows[0]?.asOfDate ?? '';
  }

  /**
   * Medications at or below their reorder level, by the stock page's rule:
   * stock is what remains of every batch not yet expired, so an expired
   * batch on the shelf does not hide a shortage. Use is the last thirty
   * days' dispenses, clinic wide.
   */
  private listReorder(
    tx: PrismaTransactionClient,
    timeZone: string,
  ): Promise<AnalyticsPharmacyReorderRow[]> {
    return tx.$queryRaw<AnalyticsPharmacyReorderRow[]>`
      WITH stock AS (
        SELECT "medication_id", sum("remaining_quantity") AS "quantity"
        FROM "medication_stock_receipts"
        WHERE "remaining_quantity" > 0
          AND ("expiry_date" IS NULL OR "expiry_date" >= (now() AT TIME ZONE ${timeZone})::date)
        GROUP BY 1
      ),
      used AS (
        SELECT di."medication_id", sum(di."quantity") AS "quantity"
        FROM "dispense_items" di
        JOIN "dispense_records" d ON d."id" = di."dispense_record_id" AND d."status" = 'DISPENSED'
        WHERE d."dispensed_at" >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${USAGE_WINDOW_DAYS})
        GROUP BY 1
      )
      SELECT m."id"::text AS "medicationId", m."code", m."name", m."strength",
             m."unit"::text AS "unit",
             COALESCE(s."quantity", 0)::int AS "stock",
             m."reorder_level" AS "reorderLevel",
             COALESCE(u."quantity", 0)::int AS "dispensedLast30Days"
      FROM "medications" m
      LEFT JOIN stock s ON s."medication_id" = m."id"
      LEFT JOIN used u ON u."medication_id" = m."id"
      WHERE m."deleted_at" IS NULL
        AND COALESCE(s."quantity", 0) <= m."reorder_level"`;
  }

  /**
   * Batches with stock left that have expired or expire within ninety days,
   * by the expiry report's rule: a batch expiring today is expiring, not
   * expired. A batch with no expiry date is in no window.
   */
  private listExpiry(
    tx: PrismaTransactionClient,
    timeZone: string,
  ): Promise<AnalyticsPharmacyExpiryRow[]> {
    const today = Prisma.sql`(now() AT TIME ZONE ${timeZone})::date`;
    return tx.$queryRaw<AnalyticsPharmacyExpiryRow[]>`
      SELECT "window",
             count(*)::int AS "batches",
             sum("remaining_quantity")::int AS "units",
             count(DISTINCT "medication_id")::int AS "medications"
      FROM (
        SELECT "medication_id", "remaining_quantity",
               CASE
                 WHEN "expiry_date" < ${today} THEN 'EXPIRED'
                 WHEN "expiry_date" <= ${today} + ${FIRST_EXPIRY_DAYS}::int THEN 'WITHIN_30_DAYS'
                 WHEN "expiry_date" <= ${today} + ${SECOND_EXPIRY_DAYS}::int THEN 'WITHIN_60_DAYS'
                 ELSE 'WITHIN_90_DAYS'
               END AS "window"
        FROM "medication_stock_receipts"
        WHERE "remaining_quantity" > 0
          AND "expiry_date" <= ${today} + ${THIRD_EXPIRY_DAYS}::int
      ) batches
      GROUP BY 1`;
  }
}
