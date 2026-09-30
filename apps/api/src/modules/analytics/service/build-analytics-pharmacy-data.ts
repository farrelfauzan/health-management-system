import {
  listAnalyticsBuckets,
  type AnalyticsPharmacyData,
  type AnalyticsPharmacyExpiryBucket,
  type AnalyticsPharmacyExpiryWindow,
  type AnalyticsPharmacyPeriodSnapshot,
  type AnalyticsPharmacyReorderItem,
  type AnalyticsPharmacyReorderRow,
  type AnalyticsPharmacySeriesPoint,
  type AnalyticsPharmacyStockHealth,
  type AnalyticsPharmacyStockSnapshot,
  type AnalyticsPharmacyTotals,
  type BuildAnalyticsPharmacyDataParams,
} from '@hms/shared-types';

const CENTS_PER_RUPIAH = 100;
const PERCENT = 100;
const ONE_DECIMAL = 10;
// The window behind a medication's average daily use (PRD FR-PHR-05).
const USAGE_WINDOW_DAYS = 30;
// How many reorder rows the response carries; `reorderCount` counts them all.
const REORDER_LIMIT = 50;
const EXPIRY_WINDOWS: readonly AnalyticsPharmacyExpiryWindow[] = [
  'EXPIRED',
  'WITHIN_30_DAYS',
  'WITHIN_60_DAYS',
  'WITHIN_90_DAYS',
];

function toRupiah(cents: number): number {
  return Math.round(cents) / CENTS_PER_RUPIAH;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;
}

function buildTotals(period: AnalyticsPharmacyPeriodSnapshot): AnalyticsPharmacyTotals {
  const { totals, revenueBuckets } = period.snapshot;
  // A prescription sent to an outside apotek will never be dispensed here.
  const dispensable = totals.prescriptionsIssued - totals.filledElsewhere;
  const revenueCents = revenueBuckets.reduce((total, row) => total + row.amountCents, 0);
  return {
    prescriptionsIssued: totals.prescriptionsIssued,
    fullyDispensed: totals.fullyDispensed,
    partiallyDispensed: totals.partiallyDispensed,
    cancelled: totals.cancelled,
    awaitingDispense: totals.awaitingDispense,
    filledElsewhere: totals.filledElsewhere,
    fullyDispensedPercent:
      dispensable > 0 ? roundToOneDecimal((totals.fullyDispensed / dispensable) * PERCENT) : null,
    medianDispenseMinutes:
      totals.medianDispenseMinutes === null ? null : Math.round(totals.medianDispenseMinutes),
    medicationRevenue: toRupiah(revenueCents),
  };
}

function buildSeries(period: AnalyticsPharmacyPeriodSnapshot): AnalyticsPharmacySeriesPoint[] {
  const prescriptions = new Map(period.snapshot.buckets.map((row) => [row.bucket, row]));
  const revenue = new Map(period.snapshot.revenueBuckets.map((row) => [row.bucket, row]));
  return listAnalyticsBuckets(period.range, period.range.granularity).map((bucket) => ({
    bucket,
    prescriptionsIssued: prescriptions.get(bucket)?.prescriptionsIssued ?? 0,
    fullyDispensed: prescriptions.get(bucket)?.fullyDispensed ?? 0,
    medicationRevenue: toRupiah(revenue.get(bucket)?.amountCents ?? 0),
  }));
}

function toReorderItem(row: AnalyticsPharmacyReorderRow): AnalyticsPharmacyReorderItem {
  const averageDailyDispensed = row.dispensedLast30Days / USAGE_WINDOW_DAYS;
  return {
    medicationId: row.medicationId,
    code: row.code,
    name: row.name,
    strength: row.strength,
    unit: row.unit,
    stock: row.stock,
    reorderLevel: row.reorderLevel,
    averageDailyDispensed: roundToOneDecimal(averageDailyDispensed),
    daysOfCover:
      averageDailyDispensed > 0 ? roundToOneDecimal(row.stock / averageDailyDispensed) : null,
  };
}

/**
 * Most urgent first: fewest days of cover, then a medication nobody used
 * lately, the furthest below its level first, then by name.
 */
function compareReorderUrgency(
  left: AnalyticsPharmacyReorderItem,
  right: AnalyticsPharmacyReorderItem,
): number {
  const leftCover = left.daysOfCover ?? Number.POSITIVE_INFINITY;
  const rightCover = right.daysOfCover ?? Number.POSITIVE_INFINITY;
  if (leftCover !== rightCover) {
    return leftCover - rightCover;
  }
  const leftShortfall = left.stock - left.reorderLevel;
  const rightShortfall = right.stock - right.reorderLevel;
  return leftShortfall !== rightShortfall
    ? leftShortfall - rightShortfall
    : left.name.localeCompare(right.name);
}

function buildExpiring(stock: AnalyticsPharmacyStockSnapshot): AnalyticsPharmacyExpiryBucket[] {
  const byWindow = new Map(stock.expiry.map((row) => [row.window, row]));
  return EXPIRY_WINDOWS.map((window) => ({
    window,
    batches: byWindow.get(window)?.batches ?? 0,
    units: byWindow.get(window)?.units ?? 0,
    medications: byWindow.get(window)?.medications ?? 0,
  }));
}

function buildStockHealth(stock: AnalyticsPharmacyStockSnapshot): AnalyticsPharmacyStockHealth {
  const reorder = stock.reorder.map(toReorderItem).sort(compareReorderUrgency);
  return {
    asOfDate: stock.asOfDate,
    reorderCount: reorder.length,
    reorder: reorder.slice(0, REORDER_LIMIT),
    expiring: buildExpiring(stock),
  };
}

/**
 * Shapes the pharmacy snapshots into the response (P29-T13). The period
 * drives the prescription flow, top medications and revenue; stock health
 * is now, and the comparison period has none.
 */
export function buildAnalyticsPharmacyData({
  current,
  comparison,
  stock,
}: BuildAnalyticsPharmacyDataParams): AnalyticsPharmacyData {
  const data: AnalyticsPharmacyData = {
    totals: buildTotals(current),
    series: buildSeries(current),
    breakdowns: {
      topMedications: current.snapshot.medications,
      stock: buildStockHealth(stock),
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
