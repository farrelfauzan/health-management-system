import type {
  AnalyticsPracticePeriodSnapshot,
  AnalyticsPracticeSnapshot,
  AnalyticsRange,
} from '@hms/shared-types';

import { buildAnalyticsPracticeData } from './build-analytics-practice-data';

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
  snapshot: Partial<AnalyticsPracticeSnapshot>,
): AnalyticsPracticePeriodSnapshot {
  return {
    range: RANGE,
    snapshot: {
      totals: { finishedEncounters: 0, codedEncounters: 0, medianConsultMinutes: null },
      buckets: [],
      appointments: { completedAppointments: 0, noShowAppointments: 0 },
      sessions: { cappedSessions: 0, capacity: 0, bookedAppointments: 0 },
      diagnoses: [],
      fees: [],
      ...snapshot,
    },
  };
}

describe('buildAnalyticsPracticeData', () => {
  it('gives the no-show rate over kept and missed, and session fill in whole points', () => {
    const inputPeriod = buildPeriod({
      totals: { finishedEncounters: 60, codedEncounters: 40, medianConsultMinutes: 11.6 },
      appointments: { completedAppointments: 219, noShowAppointments: 19 },
      sessions: { cappedSessions: 14, capacity: 280, bookedAppointments: 241 },
      fees: [
        { period: '2026-08', grossFeeCents: 120_000_00, entries: 3 },
        { period: '2026-09', grossFeeCents: 45_050_50, entries: 2 },
      ],
    });

    const actual = buildAnalyticsPracticeData({ current: inputPeriod });

    expect(actual.totals).toEqual({
      finishedEncounters: 60,
      medianConsultMinutes: 12,
      completedAppointments: 219,
      noShowAppointments: 19,
      noShowRatePercent: 8,
      sessionCapacity: 280,
      bookedAppointments: 241,
      sessionUtilisationPercent: 86,
      grossFee: 165_050.5,
    });
    expect(actual.breakdowns.codedEncounters).toBe(40);
    expect(actual.breakdowns.feesByMonth).toEqual([
      { period: '2026-08', grossFee: 120_000, entries: 3 },
      { period: '2026-09', grossFee: 45_050.5, entries: 2 },
    ]);
  });

  it('fills every bucket of the range, empty ones as zero', () => {
    const inputPeriod = buildPeriod({ buckets: [{ bucket: '2026-09-02', finishedEncounters: 7 }] });

    const actual = buildAnalyticsPracticeData({ current: inputPeriod });

    expect(actual.series).toEqual([
      { bucket: '2026-09-01', finishedEncounters: 0 },
      { bucket: '2026-09-02', finishedEncounters: 7 },
    ]);
  });

  it('has no rates with nothing to divide, and no breakdowns in the comparison', () => {
    const actual = buildAnalyticsPracticeData({
      current: buildPeriod({}),
      comparison: buildPeriod({}),
    });

    expect(actual.totals.noShowRatePercent).toBeNull();
    expect(actual.totals.sessionUtilisationPercent).toBeNull();
    expect(actual.comparison).not.toHaveProperty('breakdowns');
  });
});
