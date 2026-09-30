import {
  listAnalyticsBuckets,
  type AnalyticsLabOrderSource,
  type AnalyticsLaboratoryData,
  type AnalyticsLaboratoryPeriodSnapshot,
  type AnalyticsLaboratorySeriesPoint,
  type AnalyticsLaboratorySource,
  type AnalyticsLaboratoryTest,
  type AnalyticsLaboratoryTotals,
  type BuildAnalyticsLaboratoryDataParams,
} from '@hms/shared-types';

const PERCENT = 100;
const ONE_DECIMAL = 10;
const LAB_ORDER_SOURCES: readonly AnalyticsLabOrderSource[] = [
  'ENCOUNTER',
  'WALK_IN',
  'EXTERNAL_REFERRAL',
];

function toPercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * PERCENT * ONE_DECIMAL) / ONE_DECIMAL : null;
}

function toWholeMinutes(minutes: number | null): number | null {
  return minutes === null ? null : Math.round(minutes);
}

function buildTotals(period: AnalyticsLaboratoryPeriodSnapshot): AnalyticsLaboratoryTotals {
  const row = period.snapshot.totals;
  // An order run by an outside lab took no sample here.
  const runHere = row.orders - row.sentOut;
  return {
    orders: row.orders,
    released: row.released,
    inProgress: row.inProgress,
    sentOut: row.sentOut,
    cancelled: row.cancelled,
    medianTurnaroundMinutes: toWholeMinutes(row.medianTurnaroundMinutes),
    p90TurnaroundMinutes: toWholeMinutes(row.p90TurnaroundMinutes),
    recollectedOrders: row.recollectedOrders,
    recollectionRatePercent: toPercent(row.recollectedOrders, runHere),
    cancellationRatePercent: toPercent(row.cancelled, row.orders),
  };
}

function buildSeries(period: AnalyticsLaboratoryPeriodSnapshot): AnalyticsLaboratorySeriesPoint[] {
  const byBucket = new Map(period.snapshot.buckets.map((row) => [row.bucket, row]));
  return listAnalyticsBuckets(period.range, period.range.granularity).map((bucket) => ({
    bucket,
    orders: byBucket.get(bucket)?.orders ?? 0,
    released: byBucket.get(bucket)?.released ?? 0,
  }));
}

/** Every source, empty ones as zero, in the order the card shows them. */
function buildSources(period: AnalyticsLaboratoryPeriodSnapshot): AnalyticsLaboratorySource[] {
  const bySource = new Map(period.snapshot.sources.map((row) => [row.source, row.orders]));
  return LAB_ORDER_SOURCES.map((source) => ({ source, orders: bySource.get(source) ?? 0 }));
}

function buildTests(period: AnalyticsLaboratoryPeriodSnapshot): AnalyticsLaboratoryTest[] {
  return period.snapshot.tests.map((row) => ({
    ...row,
    medianTurnaroundMinutes: toWholeMinutes(row.medianTurnaroundMinutes),
    p90TurnaroundMinutes: toWholeMinutes(row.p90TurnaroundMinutes),
  }));
}

/**
 * Shapes the laboratory snapshots into the response (P29-T14). Turnaround
 * is in whole minutes; rates are one decimal, `null` with nothing to divide.
 */
export function buildAnalyticsLaboratoryData({
  current,
  comparison,
}: BuildAnalyticsLaboratoryDataParams): AnalyticsLaboratoryData {
  const data: AnalyticsLaboratoryData = {
    totals: buildTotals(current),
    series: buildSeries(current),
    breakdowns: { sources: buildSources(current), tests: buildTests(current) },
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
