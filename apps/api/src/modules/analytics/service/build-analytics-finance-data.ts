import {
  ANALYTICS_PAYER_TYPES,
  PAYMENT_METHODS,
  listAnalyticsBuckets,
  type AnalyticsFinanceData,
  type AnalyticsFinancePeriodSnapshot,
  type AnalyticsFinanceSeriesPoint,
  type AnalyticsFinanceTotals,
  type AnalyticsOutstandingAgeBucket,
  type AnalyticsOutstandingInvoices,
  type AnalyticsRevenueByDoctor,
  type AnalyticsRevenueByItemType,
  type AnalyticsRevenueByPayer,
  type AnalyticsRevenueByPaymentMethod,
  type AnalyticsRevenueByPoli,
  type BuildAnalyticsFinanceDataParams,
} from '@hms/shared-types';

const CENTS_PER_RUPIAH = 100;
const OUTSTANDING_AGE_BUCKETS: readonly AnalyticsOutstandingAgeBucket[] = [
  '0-7',
  '8-30',
  'over-30',
];

function toRupiah(cents: number): number {
  return Math.round(cents) / CENTS_PER_RUPIAH;
}

/** Revenue per visit, rounded to the whole rupiah; `null` with nothing to divide by. */
function toRupiahPerVisit(cents: number, visits: number): number | null {
  return visits > 0 ? Math.round(cents / visits / CENTS_PER_RUPIAH) : null;
}

function sumBy<TRow>(rows: readonly TRow[], pick: (row: TRow) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function buildTotals(period: AnalyticsFinancePeriodSnapshot): AnalyticsFinanceTotals {
  const { revenueBuckets, cashBuckets, voids, invoicedVisits } = period.snapshot;
  const revenueCents = sumBy(revenueBuckets, (row) => row.revenueCents);
  return {
    revenue: toRupiah(revenueCents),
    taxAmount: toRupiah(sumBy(revenueBuckets, (row) => row.taxCents)),
    invoices: sumBy(revenueBuckets, (row) => row.invoices),
    invoicedVisits,
    revenuePerVisit: toRupiahPerVisit(revenueCents, invoicedVisits),
    unpaidInvoices: sumBy(revenueBuckets, (row) => row.unpaidInvoices),
    unpaidAmount: toRupiah(sumBy(revenueBuckets, (row) => row.unpaidCents)),
    cashReceived: toRupiah(sumBy(cashBuckets, (row) => row.amountCents)),
    payments: sumBy(cashBuckets, (row) => row.payments),
    voidedInvoices: voids.invoices,
    voidedAmount: toRupiah(voids.amountCents),
  };
}

/** One point per bucket, quiet days included, revenue and cash side by side. */
function buildSeries(period: AnalyticsFinancePeriodSnapshot): AnalyticsFinanceSeriesPoint[] {
  const revenueByBucket = new Map(
    period.snapshot.revenueBuckets.map((row) => [row.bucket, row.revenueCents]),
  );
  const cashByBucket = new Map(
    period.snapshot.cashBuckets.map((row) => [row.bucket, row.amountCents]),
  );
  return listAnalyticsBuckets(period.range, period.range.granularity).map((bucket) => ({
    bucket,
    revenue: toRupiah(revenueByBucket.get(bucket) ?? 0),
    cashReceived: toRupiah(cashByBucket.get(bucket) ?? 0),
  }));
}

/** Every method in a fixed order, zero rows included, so the chart keeps its colours. */
function buildPaymentMethods(
  period: AnalyticsFinancePeriodSnapshot,
): AnalyticsRevenueByPaymentMethod[] {
  return PAYMENT_METHODS.map((method) => {
    const row = period.snapshot.paymentMethods.find((candidate) => candidate.method === method);
    return { method, payments: row?.payments ?? 0, amount: toRupiah(row?.amountCents ?? 0) };
  });
}

function buildItemTypes(period: AnalyticsFinancePeriodSnapshot): AnalyticsRevenueByItemType[] {
  return [...period.snapshot.itemTypes]
    .sort((left, right) => right.amountCents - left.amountCents)
    .map((row) => ({
      itemType: row.itemType,
      lines: row.lines,
      amount: toRupiah(row.amountCents),
      taxAmount: toRupiah(row.taxCents),
    }));
}

/**
 * Clinicians by revenue, the unattributed row last, each with the comparison
 * period's revenue when asked. A clinician who billed only in the comparison
 * period still shows, at zero, so the drop is visible.
 */
function buildDoctors(
  current: AnalyticsFinancePeriodSnapshot,
  comparison?: AnalyticsFinancePeriodSnapshot,
): AnalyticsRevenueByDoctor[] {
  const previousById = new Map(
    (comparison?.snapshot.doctors ?? []).map((row) => [row.doctorId, row.revenueCents]),
  );
  const currentIds = new Set(current.snapshot.doctors.map((row) => row.doctorId));
  const lapsed = (comparison?.snapshot.doctors ?? [])
    .filter((row) => !currentIds.has(row.doctorId))
    .map((row) => ({ ...row, invoices: 0, visits: 0, revenueCents: 0 }));
  return [...current.snapshot.doctors, ...lapsed]
    .map((row) => ({
      doctorId: row.doctorId,
      doctorName: row.doctorName,
      specialtyName: row.specialtyName,
      invoices: row.invoices,
      visits: row.visits,
      revenue: toRupiah(row.revenueCents),
      revenuePerVisit: toRupiahPerVisit(row.revenueCents, row.visits),
      ...(comparison ? { previousRevenue: toRupiah(previousById.get(row.doctorId) ?? 0) } : {}),
    }))
    .sort(
      (left, right) =>
        Number(left.doctorId === null) - Number(right.doctorId === null) ||
        right.revenue - left.revenue,
    );
}

function buildPoli(
  current: AnalyticsFinancePeriodSnapshot,
  comparison?: AnalyticsFinancePeriodSnapshot,
): AnalyticsRevenueByPoli[] {
  const previousById = new Map(
    (comparison?.snapshot.poli ?? []).map((row) => [row.specialtyId, row.revenueCents]),
  );
  const currentIds = new Set(current.snapshot.poli.map((row) => row.specialtyId));
  const lapsed = (comparison?.snapshot.poli ?? [])
    .filter((row) => !currentIds.has(row.specialtyId))
    .map((row) => ({ ...row, invoices: 0, revenueCents: 0 }));
  return [...current.snapshot.poli, ...lapsed].map((row) => ({
    specialtyId: row.specialtyId,
    specialtyName: row.specialtyName,
    invoices: row.invoices,
    revenue: toRupiah(row.revenueCents),
    ...(comparison ? { previousRevenue: toRupiah(previousById.get(row.specialtyId) ?? 0) } : {}),
  }));
}

/** General, BPJS, insurance, then "not recorded", always all four. */
function buildPayers(period: AnalyticsFinancePeriodSnapshot): AnalyticsRevenueByPayer[] {
  return [...ANALYTICS_PAYER_TYPES, null].map((payerType) => {
    const revenue = period.snapshot.payerRevenue.find((row) => row.payerType === payerType);
    const visits = period.snapshot.payerVisits.find((row) => row.payerType === payerType);
    return {
      payerType,
      visits: visits?.visits ?? 0,
      invoices: revenue?.invoices ?? 0,
      revenue: toRupiah(revenue?.revenueCents ?? 0),
    };
  });
}

function buildOutstanding(period: AnalyticsFinancePeriodSnapshot): AnalyticsOutstandingInvoices {
  const aging = OUTSTANDING_AGE_BUCKETS.map((bucket) => {
    const row = period.snapshot.outstanding.find((candidate) => candidate.bucket === bucket);
    return { bucket, invoices: row?.invoices ?? 0, amountCents: row?.amountCents ?? 0 };
  });
  return {
    invoices: sumBy(aging, (row) => row.invoices),
    amount: toRupiah(sumBy(aging, (row) => row.amountCents)),
    aging: aging.map((row) => ({
      bucket: row.bucket,
      invoices: row.invoices,
      amount: toRupiah(row.amountCents),
    })),
  };
}

/**
 * Shapes the finance snapshots into the response (P29-T08). Pure, so every
 * rule the dashboard shows (what counts as revenue, how a visit is averaged,
 * how an unpaid bill ages) is testable without a database. Amounts stay in
 * cents until the last step.
 */
export function buildAnalyticsFinanceData({
  current,
  comparison,
}: BuildAnalyticsFinanceDataParams): AnalyticsFinanceData {
  const data: AnalyticsFinanceData = {
    totals: buildTotals(current),
    series: buildSeries(current),
    breakdowns: {
      paymentMethods: buildPaymentMethods(current),
      itemTypes: buildItemTypes(current),
      doctors: buildDoctors(current, comparison),
      poli: buildPoli(current, comparison),
      payers: buildPayers(current),
      outstanding: buildOutstanding(current),
    },
  };
  if (!comparison) {
    return data;
  }
  return {
    ...data,
    comparison: {
      from: comparison.range.from,
      to: comparison.range.to,
      totals: buildTotals(comparison),
      series: buildSeries(comparison),
    },
  };
}
