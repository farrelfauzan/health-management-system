import { Injectable } from '@nestjs/common';
import type {
  AnalyticsCashBucketRow,
  AnalyticsFinanceDoctorRow,
  AnalyticsFinancePayerRow,
  AnalyticsFinancePoliRow,
  AnalyticsFinanceSnapshot,
  AnalyticsInvoiceCountRow,
  AnalyticsInvoicedVisitRow,
  AnalyticsItemTypeRow,
  AnalyticsOutstandingAgeRow,
  AnalyticsPaymentMethodRow,
  AnalyticsPayerVisitRow,
  AnalyticsRevenueBucketRow,
  AnalyticsSqlScope,
} from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import type { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { ANALYTICS_INVOICE_VISIT_JOINS } from './analytics-invoice-visit-joins';
import { AnalyticsQueryRepository } from './analytics-query.repository';
import { buildAnalyticsInvoiceNarrowing } from './build-analytics-invoice-narrowing';
import { buildAnalyticsInvoiceRevenueFilter } from './build-analytics-invoice-revenue-filter';
import { buildAnalyticsVisitFilter } from './build-analytics-visit-filter';

// Unpaid invoices older than a week and older than a month (PRD FR-FIN-05).
const FIRST_AGE_LIMIT_DAYS = 7;
const SECOND_AGE_LIMIT_DAYS = 30;

/** A money column summed to whole cents, exact as a float below 2^53. */
function sumCents(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(COALESCE(sum(${column}), 0) * 100)::float8`;
}

/** As `sumCents`, over the rows that meet `condition`. */
function sumCentsWhere(column: Prisma.Sql, condition: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(COALESCE(sum(${column}) FILTER (WHERE ${condition}), 0) * 100)::float8`;
}

/**
 * The finance dashboard's reads (P29-T08, PRD FR-FIN-01 to 06), over the
 * invoice, invoice line and payment tables (D-049). Revenue follows the
 * invoice date (Q-3): ISSUED and PAID invoices by `issuedAt`. Cash received
 * follows `paidAt` and filters payments exactly as the cashier report does,
 * so the two reconcile to the rupiah.
 */
@Injectable()
export class AnalyticsFinanceRepository {
  constructor(private readonly analyticsQueryRepository: AnalyticsQueryRepository) {}

  /** Every finance figure for one period, in one read-only transaction. */
  readSnapshot(scope: AnalyticsSqlScope): Promise<AnalyticsFinanceSnapshot> {
    return this.analyticsQueryRepository.runReadOnly(async (tx) => ({
      revenueBuckets: await this.listRevenueBuckets(tx, scope),
      cashBuckets: await this.listCashBuckets(tx, scope),
      paymentMethods: await this.listPaymentMethods(tx, scope),
      itemTypes: await this.listItemTypes(tx, scope),
      doctors: await this.listRevenueByDoctor(tx, scope),
      poli: await this.listRevenueByPoli(tx, scope),
      payerRevenue: await this.listRevenueByPayer(tx, scope),
      payerVisits: await this.listVisitsByPayer(tx, scope),
      invoicedVisits: await this.countInvoicedVisits(tx, scope),
      voids: await this.readVoids(tx, scope),
      outstanding: await this.listOutstanding(tx, scope),
    }));
  }

  /** A payment received in the range. No invoice state is checked: the cashier report checks none. */
  private buildCashFilter(scope: AnalyticsSqlScope): Prisma.Sql {
    return Prisma.sql`p."paid_at" >= ${scope.startUtc}::timestamp
      AND p."paid_at" < ${scope.endUtc}::timestamp
      ${buildAnalyticsInvoiceNarrowing(scope)}`;
  }

  private buildBucket(scope: AnalyticsSqlScope, column: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`to_char(
      date_trunc(${scope.granularity}, (${column} AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone}),
      'YYYY-MM-DD')`;
  }

  private listRevenueBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsRevenueBucketRow[]> {
    return tx.$queryRaw<AnalyticsRevenueBucketRow[]>`
      SELECT ${this.buildBucket(scope, Prisma.sql`i."issued_at"`)} AS "bucket",
             count(*)::int AS "invoices",
             ${sumCents(Prisma.sql`i."total_amount"`)} AS "revenueCents",
             ${sumCents(Prisma.sql`i."tax_amount"`)} AS "taxCents",
             count(*) FILTER (WHERE i."status" = 'ISSUED')::int AS "unpaidInvoices",
             ${sumCentsWhere(Prisma.sql`i."total_amount"`, Prisma.sql`i."status" = 'ISSUED'`)} AS "unpaidCents"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE ${buildAnalyticsInvoiceRevenueFilter(scope)}
      GROUP BY 1`;
  }

  private listCashBuckets(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsCashBucketRow[]> {
    return tx.$queryRaw<AnalyticsCashBucketRow[]>`
      SELECT ${this.buildBucket(scope, Prisma.sql`p."paid_at"`)} AS "bucket",
             count(*)::int AS "payments",
             ${sumCents(Prisma.sql`p."amount"`)} AS "amountCents"
      FROM "payments" p
      JOIN "invoices" i ON i."id" = p."invoice_id"
      ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE ${this.buildCashFilter(scope)}
      GROUP BY 1`;
  }

  private listPaymentMethods(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPaymentMethodRow[]> {
    return tx.$queryRaw<AnalyticsPaymentMethodRow[]>`
      SELECT p."method"::text AS "method",
             count(*)::int AS "payments",
             ${sumCents(Prisma.sql`p."amount"`)} AS "amountCents"
      FROM "payments" p
      JOIN "invoices" i ON i."id" = p."invoice_id"
      ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE ${this.buildCashFilter(scope)}
      GROUP BY 1`;
  }

  private listItemTypes(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsItemTypeRow[]> {
    return tx.$queryRaw<AnalyticsItemTypeRow[]>`
      SELECT it."item_type"::text AS "itemType",
             count(*)::int AS "lines",
             ${sumCents(Prisma.sql`it."amount"`)} AS "amountCents",
             ${sumCents(Prisma.sql`it."tax_amount"`)} AS "taxCents"
      FROM "invoice_items" it
      JOIN "invoices" i ON i."id" = it."invoice_id"
      ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE ${buildAnalyticsInvoiceRevenueFilter(scope)}
      GROUP BY 1`;
  }

  private listRevenueByDoctor(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsFinanceDoctorRow[]> {
    return tx.$queryRaw<AnalyticsFinanceDoctorRow[]>`
      SELECT e."doctor_id"::text AS "doctorId", d."full_name" AS "doctorName",
             ds."name" AS "specialtyName",
             count(*)::int AS "invoices",
             count(DISTINCT COALESCE(r."id", i."id"))::int AS "visits",
             ${sumCents(Prisma.sql`i."total_amount"`)} AS "revenueCents"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      LEFT JOIN "doctor_profiles" d ON d."id" = e."doctor_id"
      LEFT JOIN "specialties" ds ON ds."id" = d."specialty_id"
      WHERE ${buildAnalyticsInvoiceRevenueFilter(scope)}
      GROUP BY 1, 2, 3
      ORDER BY "revenueCents" DESC`;
  }

  private listRevenueByPoli(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsFinancePoliRow[]> {
    return tx.$queryRaw<AnalyticsFinancePoliRow[]>`
      SELECT r."specialty_id"::text AS "specialtyId", s."name" AS "specialtyName",
             count(*)::int AS "invoices",
             ${sumCents(Prisma.sql`i."total_amount"`)} AS "revenueCents"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      LEFT JOIN "specialties" s ON s."id" = r."specialty_id"
      WHERE ${buildAnalyticsInvoiceRevenueFilter(scope)}
      GROUP BY 1, 2
      ORDER BY "revenueCents" DESC`;
  }

  private listRevenueByPayer(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsFinancePayerRow[]> {
    return tx.$queryRaw<AnalyticsFinancePayerRow[]>`
      SELECT r."payer_type"::text AS "payerType",
             count(*)::int AS "invoices",
             ${sumCents(Prisma.sql`i."total_amount"`)} AS "revenueCents"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE ${buildAnalyticsInvoiceRevenueFilter(scope)}
      GROUP BY 1`;
  }

  /** Visits in the range by payer, billed or not: the payer mix of the waiting room. */
  private listVisitsByPayer(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsPayerVisitRow[]> {
    return tx.$queryRaw<AnalyticsPayerVisitRow[]>`
      SELECT r."payer_type"::text AS "payerType", count(*)::int AS "visits"
      FROM "registrations" r
      WHERE ${buildAnalyticsVisitFilter(scope)}
      GROUP BY 1`;
  }

  /** Visits billed in the range; a bill that names no visit counts once on its own. */
  private async countInvoicedVisits(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<number> {
    const rows = await tx.$queryRaw<AnalyticsInvoicedVisitRow[]>`
      SELECT count(DISTINCT COALESCE(r."id", i."id"))::int AS "invoicedVisits"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE ${buildAnalyticsInvoiceRevenueFilter(scope)}`;
    return rows[0]?.invoicedVisits ?? 0;
  }

  /** Invoices voided in the range after they were issued. A voided draft billed nobody. */
  private async readVoids(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsInvoiceCountRow> {
    const rows = await tx.$queryRaw<AnalyticsInvoiceCountRow[]>`
      SELECT count(*)::int AS "invoices", ${sumCents(Prisma.sql`i."total_amount"`)} AS "amountCents"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE i."deleted_at" IS NULL
        AND i."status" = 'VOID'
        AND i."issued_at" IS NOT NULL
        AND i."voided_at" >= ${scope.startUtc}::timestamp
        AND i."voided_at" < ${scope.endUtc}::timestamp
        ${buildAnalyticsInvoiceNarrowing(scope)}`;
    return rows[0] ?? { invoices: 0, amountCents: 0 };
  }

  /** Unpaid invoices now, by clinic days since issue. The range does not apply. */
  private listOutstanding(
    tx: PrismaTransactionClient,
    scope: AnalyticsSqlScope,
  ): Promise<AnalyticsOutstandingAgeRow[]> {
    const ageDays = Prisma.sql`((now() AT TIME ZONE ${scope.timeZone})::date
      - ((i."issued_at" AT TIME ZONE 'UTC') AT TIME ZONE ${scope.timeZone})::date)`;
    return tx.$queryRaw<AnalyticsOutstandingAgeRow[]>`
      SELECT CASE
               WHEN ${ageDays} <= ${FIRST_AGE_LIMIT_DAYS} THEN '0-7'
               WHEN ${ageDays} <= ${SECOND_AGE_LIMIT_DAYS} THEN '8-30'
               ELSE 'over-30'
             END AS "bucket",
             count(*)::int AS "invoices",
             ${sumCents(Prisma.sql`i."total_amount"`)} AS "amountCents"
      FROM "invoices" i ${ANALYTICS_INVOICE_VISIT_JOINS}
      WHERE i."deleted_at" IS NULL AND i."status" = 'ISSUED' AND i."issued_at" IS NOT NULL
        ${buildAnalyticsInvoiceNarrowing(scope)}
      GROUP BY 1`;
  }
}
