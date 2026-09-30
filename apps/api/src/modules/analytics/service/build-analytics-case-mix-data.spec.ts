import type {
  AnalyticsCaseMixPeriodSnapshot,
  AnalyticsCaseMixSnapshot,
  AnalyticsRange,
} from '@hms/shared-types';

import { buildAnalyticsCaseMixData } from './build-analytics-case-mix-data';

const RANGE: AnalyticsRange = {
  from: '2026-09-01',
  to: '2026-09-02',
  timeZone: 'Asia/Jakarta',
  granularity: 'day',
  dayCount: 2,
  start: new Date('2026-08-31T17:00:00.000Z'),
  end: new Date('2026-09-02T17:00:00.000Z'),
};

function buildPeriod(snapshot: Partial<AnalyticsCaseMixSnapshot>): AnalyticsCaseMixPeriodSnapshot {
  return {
    range: RANGE,
    snapshot: {
      totals: { finishedEncounters: 0, codedEncounters: 0, distinctCodes: 0 },
      buckets: [],
      diagnoses: [],
      groups: [],
      poli: [],
      procedures: [],
      ...snapshot,
    },
  };
}

describe('buildAnalyticsCaseMixData', () => {
  it('keeps ten codes, folds the rest into one row, and adds the uncoded so the list covers every encounter', () => {
    const diagnoses = Array.from({ length: 12 }, (_, index) => ({
      code: `A${index}`,
      name: `Kode ${index}`,
      count: 20 - index,
    }));
    const inputPeriod = buildPeriod({
      totals: { finishedEncounters: 200, codedEncounters: 186, distinctCodes: 12 },
      diagnoses,
    });

    const actual = buildAnalyticsCaseMixData({ current: inputPeriod });
    const rows = actual.breakdowns.topDiagnoses;

    expect(rows).toHaveLength(12);
    expect(rows[10]).toEqual({
      kind: 'OTHER',
      code: null,
      name: null,
      otherCodes: 2,
      count: 19,
      sharePercent: 9.5,
    });
    expect(rows[11]).toMatchObject({ kind: 'UNCODED', count: 14, sharePercent: 7 });
  });

  it('groups by letter five deep, folding the rest', () => {
    const inputPeriod = buildPeriod({
      totals: { finishedEncounters: 100, codedEncounters: 100, distinctCodes: 7 },
      groups: ['J', 'K', 'I', 'Z', 'E', 'A', 'B'].map((group, index) => ({
        group,
        count: 30 - index * 4,
      })),
    });

    const actual = buildAnalyticsCaseMixData({ current: inputPeriod });

    expect(actual.breakdowns.groups.map((row) => row.group ?? row.kind)).toEqual([
      'J',
      'K',
      'I',
      'Z',
      'E',
      'OTHER',
    ]);
    expect(actual.breakdowns.groups[5]).toMatchObject({ otherGroups: 2, count: 16 });
  });

  it("withholds a poli's completeness with its uncoded count, since the two would give each other away", () => {
    const inputPeriod = buildPeriod({
      totals: { finishedEncounters: 80, codedEncounters: 57, distinctCodes: 3 },
      poli: [
        { specialtyId: 'a', specialtyName: 'Umum', finishedEncounters: 40, codedEncounters: 28 },
        { specialtyId: 'b', specialtyName: 'Gigi', finishedEncounters: 20, codedEncounters: 17 },
        { specialtyId: 'c', specialtyName: 'Anak', finishedEncounters: 20, codedEncounters: 12 },
      ],
    });

    const actual = buildAnalyticsCaseMixData({ current: inputPeriod });

    // Gigi's 3 is small; Anak's 8 goes with it, or 23 minus 12 would give 3 back.
    expect(actual.breakdowns.codingByPoli).toEqual([
      expect.objectContaining({
        specialtyName: 'Umum',
        uncodedEncounters: 12,
        codingCompletenessPercent: 70,
      }),
      expect.objectContaining({
        specialtyName: 'Gigi',
        uncodedEncounters: { suppressed: true },
        codingCompletenessPercent: null,
      }),
      expect.objectContaining({
        specialtyName: 'Anak',
        uncodedEncounters: { suppressed: true },
        codingCompletenessPercent: null,
      }),
    ]);
  });

  it('has no completeness with nothing finished', () => {
    const actual = buildAnalyticsCaseMixData({ current: buildPeriod({}) });

    expect(actual.totals.codingCompletenessPercent).toBeNull();
    expect(actual.breakdowns.topDiagnoses).toEqual([]);
  });
});
