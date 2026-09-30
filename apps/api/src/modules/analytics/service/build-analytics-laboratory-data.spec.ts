import type {
  AnalyticsLaboratoryPeriodSnapshot,
  AnalyticsLaboratorySnapshot,
  AnalyticsRange,
} from '@hms/shared-types';

import { buildAnalyticsLaboratoryData } from './build-analytics-laboratory-data';

const RANGE: AnalyticsRange = {
  from: '2026-09-01',
  to: '2026-09-02',
  timeZone: 'Asia/Jakarta',
  granularity: 'day',
  dayCount: 2,
  start: new Date('2026-08-31T17:00:00.000Z'),
  end: new Date('2026-09-02T17:00:00.000Z'),
};

function buildPeriod(
  snapshot: Partial<AnalyticsLaboratorySnapshot>,
): AnalyticsLaboratoryPeriodSnapshot {
  return {
    range: RANGE,
    snapshot: {
      totals: {
        orders: 0,
        released: 0,
        inProgress: 0,
        sentOut: 0,
        cancelled: 0,
        recollectedOrders: 0,
        medianTurnaroundMinutes: null,
        p90TurnaroundMinutes: null,
      },
      buckets: [],
      sources: [],
      tests: [],
      ...snapshot,
    },
  };
}

describe('buildAnalyticsLaboratoryData', () => {
  it('leaves orders sent to an outside lab out of the recollection rate, and rounds turnaround', () => {
    const inputPeriod = buildPeriod({
      totals: {
        orders: 100,
        released: 70,
        inProgress: 5,
        sentOut: 20,
        cancelled: 5,
        recollectedOrders: 4,
        medianTurnaroundMinutes: 44.5,
        p90TurnaroundMinutes: 129.6,
      },
    });

    const actual = buildAnalyticsLaboratoryData({ current: inputPeriod });

    expect(actual.totals).toMatchObject({
      recollectionRatePercent: 5,
      cancellationRatePercent: 5,
      medianTurnaroundMinutes: 45,
      p90TurnaroundMinutes: 130,
    });
  });

  it('answers every source, empty ones as zero, in order', () => {
    const inputPeriod = buildPeriod({ sources: [{ source: 'WALK_IN', orders: 3 }] });

    const actual = buildAnalyticsLaboratoryData({ current: inputPeriod });

    expect(actual.breakdowns.sources).toEqual([
      { source: 'ENCOUNTER', orders: 0 },
      { source: 'WALK_IN', orders: 3 },
      { source: 'EXTERNAL_REFERRAL', orders: 0 },
    ]);
  });

  it('keeps a test with nothing released yet, with no turnaround', () => {
    const inputPeriod = buildPeriod({
      tests: [
        {
          labTestId: 'cbc',
          code: 'CBC',
          name: 'Darah lengkap',
          orders: 3,
          releasedOrders: 0,
          medianTurnaroundMinutes: null,
          p90TurnaroundMinutes: null,
        },
      ],
    });

    const actual = buildAnalyticsLaboratoryData({ current: inputPeriod });

    expect(actual.breakdowns.tests[0]).toMatchObject({ orders: 3, medianTurnaroundMinutes: null });
  });

  it('has no rates with no orders, and no breakdowns in the comparison', () => {
    const actual = buildAnalyticsLaboratoryData({
      current: buildPeriod({}),
      comparison: buildPeriod({}),
    });

    expect(actual.totals.recollectionRatePercent).toBeNull();
    expect(actual.totals.cancellationRatePercent).toBeNull();
    expect(actual.comparison).not.toHaveProperty('breakdowns');
  });
});
