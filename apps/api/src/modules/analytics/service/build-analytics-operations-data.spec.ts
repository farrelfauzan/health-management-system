import {
  computeChangePercent,
  resolveAnalyticsRange,
  type AnalyticsOperationsPeriodSnapshot,
  type AnalyticsOperationsSnapshot,
} from '@hms/shared-types';

import { buildAnalyticsOperationsData } from './build-analytics-operations-data';

describe('buildAnalyticsOperationsData', () => {
  const POLI_UMUM_ID = '11111111-1111-4111-8111-111111111111';
  const POLI_ANAK_ID = '22222222-2222-4222-8222-222222222222';
  const DOCTOR_ID = '33333333-3333-4333-8333-333333333333';

  function buildSnapshot(
    overrides: Partial<AnalyticsOperationsSnapshot> = {},
  ): AnalyticsOperationsSnapshot {
    return {
      visitBuckets: [],
      newAndReturning: { newPatients: 0, returningPatients: 0 },
      poli: [],
      doctors: [],
      outcomes: [],
      channels: [],
      walkIns: 0,
      ...overrides,
    };
  }

  function buildPeriod(
    from: string,
    to: string,
    snapshot: AnalyticsOperationsSnapshot,
  ): AnalyticsOperationsPeriodSnapshot {
    return { range: resolveAnalyticsRange({ from, to, timeZone: 'Asia/Jakarta' }), snapshot };
  }

  it('sums visits by type into the totals and fills quiet days in the series', () => {
    const inputCurrent = buildPeriod(
      '2026-09-01',
      '2026-09-30',
      buildSnapshot({
        visitBuckets: [
          { bucket: '2026-09-02', type: 'CONSULTATION', visits: 10 },
          { bucket: '2026-09-02', type: 'LAB_ONLY', visits: 2 },
          { bucket: '2026-09-15', type: 'ADMISSION', visits: 1 },
        ],
      }),
    );

    const actual = buildAnalyticsOperationsData({ current: inputCurrent });

    expect(actual.totals.visits).toBe(13);
    expect(actual.series).toHaveLength(30);
    expect(actual.series[1]).toEqual({
      bucket: '2026-09-02',
      visits: 12,
      consultation: 10,
      labOnly: 2,
      admission: 0,
    });
    expect(actual.series[0]).toEqual({
      bucket: '2026-09-01',
      visits: 0,
      consultation: 0,
      labOnly: 0,
      admission: 0,
    });
    expect(actual.breakdowns.visitsByType).toEqual([
      { type: 'CONSULTATION', visits: 10 },
      { type: 'LAB_ONLY', visits: 2 },
      { type: 'ADMISSION', visits: 1 },
    ]);
  });

  it('shows Poli Umum at 150 against 120, which is +25%', () => {
    const inputCurrent = buildPeriod(
      '2026-09-01',
      '2026-09-30',
      buildSnapshot({
        poli: [{ specialtyId: POLI_UMUM_ID, specialtyName: 'Poli Umum', visits: 150 }],
      }),
    );
    const inputComparison = buildPeriod(
      '2026-08-01',
      '2026-08-31',
      buildSnapshot({
        poli: [{ specialtyId: POLI_UMUM_ID, specialtyName: 'Poli Umum', visits: 120 }],
      }),
    );

    const actual = buildAnalyticsOperationsData({
      current: inputCurrent,
      comparison: inputComparison,
    });
    const actualPoliUmum = actual.breakdowns.visitsByPoli[0];

    expect(actualPoliUmum).toEqual({
      specialtyId: POLI_UMUM_ID,
      specialtyName: 'Poli Umum',
      visits: 150,
      previousVisits: 120,
    });
    expect(
      computeChangePercent(actualPoliUmum?.visits ?? 0, actualPoliUmum?.previousVisits ?? 0),
    ).toBe(25);
    expect(actual.comparison).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(actual.comparison?.series).toHaveLength(31);
  });

  it('keeps a poli that went quiet, at zero, with last period beside it', () => {
    const inputCurrent = buildPeriod('2026-09-01', '2026-09-30', buildSnapshot());
    const inputComparison = buildPeriod(
      '2026-08-01',
      '2026-08-31',
      buildSnapshot({ poli: [{ specialtyId: POLI_ANAK_ID, specialtyName: 'Anak', visits: 9 }] }),
    );

    const actual = buildAnalyticsOperationsData({
      current: inputCurrent,
      comparison: inputComparison,
    });

    expect(actual.breakdowns.visitsByPoli).toEqual([
      { specialtyId: POLI_ANAK_ID, specialtyName: 'Anak', visits: 0, previousVisits: 9 },
    ]);
  });

  it('leaves previousVisits off when compare is off', () => {
    const inputCurrent = buildPeriod(
      '2026-09-01',
      '2026-09-30',
      buildSnapshot({ doctors: [{ doctorId: DOCTOR_ID, doctorName: 'dr. Sari', visits: 40 }] }),
    );

    const actual = buildAnalyticsOperationsData({ current: inputCurrent });

    expect(actual.breakdowns.visitsByDoctor).toEqual([
      { doctorId: DOCTOR_ID, doctorName: 'dr. Sari', visits: 40 },
    ]);
    expect(actual.comparison).toBeUndefined();
  });

  it('gives WhatsApp 25% for 30 completed and 10 no-shows', () => {
    const inputCurrent = buildPeriod(
      '2026-09-01',
      '2026-09-30',
      buildSnapshot({
        channels: [{ channel: 'WHATSAPP', bookings: 40, completed: 30, noShows: 10 }],
      }),
    );

    const actual = buildAnalyticsOperationsData({ current: inputCurrent });

    expect(actual.breakdowns.bookingChannels.find((row) => row.channel === 'WHATSAPP')).toEqual({
      channel: 'WHATSAPP',
      bookings: 40,
      completed: 30,
      noShows: 10,
      noShowRatePercent: 25,
    });
  });

  it('lists every channel in a fixed order, walk-ins first with no no-show rate', () => {
    const inputCurrent = buildPeriod('2026-09-01', '2026-09-30', buildSnapshot({ walkIns: 57 }));

    const actual = buildAnalyticsOperationsData({ current: inputCurrent });

    expect(actual.breakdowns.bookingChannels.map((row) => row.channel)).toEqual([
      'WALK_IN',
      'STAFF',
      'WHATSAPP',
      'TELEGRAM',
      'MOBILE_JKN',
    ]);
    expect(actual.breakdowns.bookingChannels[0]).toEqual({
      channel: 'WALK_IN',
      bookings: 57,
      completed: 57,
      noShows: 0,
      noShowRatePercent: null,
    });
  });

  it('computes the no-show rate from completed and no-show only', () => {
    const inputCurrent = buildPeriod(
      '2026-09-01',
      '2026-09-30',
      buildSnapshot({
        outcomes: [
          { status: 'COMPLETED', appointments: 610 },
          { status: 'NO_SHOW', appointments: 65 },
          { status: 'CANCELLED', appointments: 48 },
          { status: 'REJECTED', appointments: 6 },
        ],
      }),
    );

    const actual = buildAnalyticsOperationsData({ current: inputCurrent });

    expect(actual.totals).toMatchObject({
      appointments: 729,
      completedAppointments: 610,
      noShowAppointments: 65,
      noShowRatePercent: 9.6,
    });
    expect(actual.breakdowns.appointmentOutcomes[0]).toEqual({
      status: 'COMPLETED',
      appointments: 610,
    });
  });
});
