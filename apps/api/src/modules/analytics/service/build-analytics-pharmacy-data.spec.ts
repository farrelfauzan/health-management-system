import type {
  AnalyticsPharmacyPeriodSnapshot,
  AnalyticsPharmacySnapshot,
  AnalyticsPharmacyStockSnapshot,
  AnalyticsRange,
} from '@hms/shared-types';

import { buildAnalyticsPharmacyData } from './build-analytics-pharmacy-data';

const RANGE: AnalyticsRange = {
  from: '2026-09-01',
  to: '2026-09-02',
  timeZone: 'Asia/Jakarta',
  granularity: 'day',
  dayCount: 2,
  start: new Date('2026-08-31T17:00:00.000Z'),
  end: new Date('2026-09-02T17:00:00.000Z'),
};

const EMPTY_STOCK: AnalyticsPharmacyStockSnapshot = {
  asOfDate: '2026-09-30',
  reorder: [],
  expiry: [],
};

function buildPeriod(
  snapshot: Partial<AnalyticsPharmacySnapshot>,
): AnalyticsPharmacyPeriodSnapshot {
  return {
    range: RANGE,
    snapshot: {
      totals: {
        prescriptionsIssued: 0,
        fullyDispensed: 0,
        partiallyDispensed: 0,
        cancelled: 0,
        awaitingDispense: 0,
        filledElsewhere: 0,
        medianDispenseMinutes: null,
      },
      buckets: [],
      revenueBuckets: [],
      medications: [],
      ...snapshot,
    },
  };
}

function buildReorderRow(
  name: string,
  stock: number,
  reorderLevel: number,
  dispensedLast30Days: number,
) {
  return {
    medicationId: name,
    code: name.toUpperCase(),
    name,
    strength: null,
    unit: 'TABLET' as const,
    stock,
    reorderLevel,
    dispensedLast30Days,
  };
}

describe('buildAnalyticsPharmacyData', () => {
  it('leaves prescriptions filled at an outside apotek out of the fully dispensed rate', () => {
    const inputPeriod = buildPeriod({
      totals: {
        prescriptionsIssued: 100,
        fullyDispensed: 72,
        partiallyDispensed: 4,
        cancelled: 2,
        awaitingDispense: 2,
        filledElsewhere: 20,
        medianDispenseMinutes: 13.6,
      },
      revenueBuckets: [
        { bucket: '2026-09-01', amountCents: 150_000_00 },
        { bucket: '2026-09-02', amountCents: 25_050_50 },
      ],
    });

    const actual = buildAnalyticsPharmacyData({ current: inputPeriod, stock: EMPTY_STOCK });

    expect(actual.totals).toMatchObject({
      fullyDispensedPercent: 90,
      medianDispenseMinutes: 14,
      medicationRevenue: 175_050.5,
    });
    expect(actual.series.map((point) => point.medicationRevenue)).toEqual([150_000, 25_050.5]);
  });

  it('lists the most urgent reorder first: fewest days of cover, then unused, furthest below', () => {
    const inputStock: AnalyticsPharmacyStockSnapshot = {
      ...EMPTY_STOCK,
      reorder: [
        buildReorderRow('oralit', 35, 50, 300),
        buildReorderRow('vitamin', 0, 0, 0),
        buildReorderRow('amoksisilin', 40, 50, 990),
        buildReorderRow('salep', 2, 10, 0),
      ],
    };

    const actual = buildAnalyticsPharmacyData({ current: buildPeriod({}), stock: inputStock });

    expect(actual.breakdowns.stock.reorderCount).toBe(4);
    expect(actual.breakdowns.stock.reorder.map((row) => row.name)).toEqual([
      'amoksisilin',
      'oralit',
      'salep',
      'vitamin',
    ]);
    expect(actual.breakdowns.stock.reorder[0]).toMatchObject({
      stock: 40,
      reorderLevel: 50,
      averageDailyDispensed: 33,
      daysOfCover: 1.2,
    });
    expect(actual.breakdowns.stock.reorder[3]?.daysOfCover).toBeNull();
  });

  it('answers every expiry window, empty ones as zero, in order', () => {
    const inputStock: AnalyticsPharmacyStockSnapshot = {
      ...EMPTY_STOCK,
      expiry: [{ window: 'WITHIN_60_DAYS', batches: 5, units: 300, medications: 4 }],
    };

    const actual = buildAnalyticsPharmacyData({ current: buildPeriod({}), stock: inputStock });

    expect(actual.breakdowns.stock.expiring).toEqual([
      { window: 'EXPIRED', batches: 0, units: 0, medications: 0 },
      { window: 'WITHIN_30_DAYS', batches: 0, units: 0, medications: 0 },
      { window: 'WITHIN_60_DAYS', batches: 5, units: 300, medications: 4 },
      { window: 'WITHIN_90_DAYS', batches: 0, units: 0, medications: 0 },
    ]);
  });

  it('has no rate with nothing dispensable, and no stock in the comparison', () => {
    const actual = buildAnalyticsPharmacyData({
      current: buildPeriod({}),
      comparison: buildPeriod({}),
      stock: EMPTY_STOCK,
    });

    expect(actual.totals.fullyDispensedPercent).toBeNull();
    expect(actual.totals.medianDispenseMinutes).toBeNull();
    expect(actual.comparison).toEqual(
      expect.objectContaining({ from: RANGE.from, totals: expect.any(Object) }),
    );
    expect(actual.comparison).not.toHaveProperty('breakdowns');
  });
});
