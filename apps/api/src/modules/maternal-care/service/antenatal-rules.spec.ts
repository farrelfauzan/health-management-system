import {
  buildTrimesterSchedule,
  computeEstimatedDeliveryDate,
  computeGestationalAge,
  numberAntenatalVisits,
  resolveAntenatalVisitCode,
  resolveDoctorVisitRequirements,
  resolveTrimester,
} from '@hms/shared-types';

/** US-ANC-01's mother: HPHT 2 February 2026, so the HPL is 9 November 2026. */
const INPUT_LMP = new Date('2026-02-02T00:00:00.000Z');
const EXPECTED_EDD = new Date('2026-11-09T00:00:00.000Z');

function buildDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe('computeEstimatedDeliveryDate', () => {
  it('adds 280 days to the HPHT (Naegele)', () => {
    const actual = computeEstimatedDeliveryDate(INPUT_LMP);

    expect(actual.toISOString().slice(0, 10)).toBe('2026-11-09');
  });

  it('does not drift across a month boundary', () => {
    const actual = computeEstimatedDeliveryDate(buildDate('2026-01-31'));

    expect(actual.toISOString().slice(0, 10)).toBe('2026-11-07');
  });
});

describe('computeGestationalAge', () => {
  it('counts weeks and days from the HPHT', () => {
    const actual = computeGestationalAge({
      lastMenstrualPeriodDate: INPUT_LMP,
      estimatedDeliveryDate: EXPECTED_EDD,
      asOf: buildDate('2026-08-24'),
    });

    expect(actual).toEqual({ weeks: 29, days: 0 });
  });

  it('falls back to the HPL when no HPHT was recorded', () => {
    const actual = computeGestationalAge({
      lastMenstrualPeriodDate: null,
      estimatedDeliveryDate: EXPECTED_EDD,
      asOf: buildDate('2026-08-24'),
    });

    expect(actual).toEqual({ weeks: 29, days: 0 });
  });

  it('reports a date before the HPHT as zero rather than as a negative age', () => {
    const actual = computeGestationalAge({
      lastMenstrualPeriodDate: INPUT_LMP,
      estimatedDeliveryDate: EXPECTED_EDD,
      asOf: buildDate('2026-01-01'),
    });

    expect(actual).toEqual({ weeks: 0, days: 0 });
  });
});

describe('resolveTrimester', () => {
  it.each([
    [{ weeks: 0, days: 0 }, 1],
    [{ weeks: 12, days: 6 }, 1],
    [{ weeks: 13, days: 0 }, 2],
    [{ weeks: 24, days: 6 }, 2],
    [{ weeks: 25, days: 0 }, 3],
    [{ weeks: 40, days: 0 }, 3],
  ])('puts %o in trimester %i', (inputAge, expectedTrimester) => {
    expect(resolveTrimester(inputAge)).toBe(expectedTrimester);
  });
});

describe('resolveAntenatalVisitCode', () => {
  it('calls a first visit inside trimester 1 K1M', () => {
    expect(resolveAntenatalVisitCode({ ordinal: 1, firstVisitTrimester: 1 })).toBe('K1M');
  });

  it('calls a first visit after trimester 1 K1A', () => {
    expect(resolveAntenatalVisitCode({ ordinal: 1, firstVisitTrimester: 2 })).toBe('K1A');
  });

  it.each([
    [2, 'K2'],
    [3, 'K3'],
    [6, 'K6'],
  ])('numbers visit %i as %s', (inputOrdinal, expectedCode) => {
    expect(resolveAntenatalVisitCode({ ordinal: inputOrdinal, firstVisitTrimester: 1 })).toBe(
      expectedCode,
    );
  });

  it('gives a seventh visit no code, because the published list stops at K6', () => {
    expect(resolveAntenatalVisitCode({ ordinal: 7, firstVisitTrimester: 1 })).toBeNull();
  });
});

describe('numberAntenatalVisits', () => {
  const episode = { lastMenstrualPeriodDate: INPUT_LMP, estimatedDeliveryDate: EXPECTED_EDD };

  function buildVisit(encounterId: string, startedAt: string, overrides = {}) {
    return {
      encounterId,
      startedAt: buildDate(startedAt),
      isCancelled: false,
      frozenVisitCode: null,
      ...overrides,
    };
  }

  it('numbers visits by when they started, not by when they were entered', () => {
    const actual = numberAntenatalVisits({
      ...episode,
      visits: [buildVisit('later', '2026-06-01'), buildVisit('earlier', '2026-03-01')],
    });

    expect(actual.map((visit) => visit.encounterId)).toEqual(['earlier', 'later']);
    expect(actual.map((visit) => visit.visitCode)).toEqual(['K1M', 'K2']);
  });

  it('renumbers the open visits after one in the middle is cancelled', () => {
    const actual = numberAntenatalVisits({
      ...episode,
      visits: [
        buildVisit('first', '2026-03-01'),
        buildVisit('cancelled', '2026-05-01', { isCancelled: true }),
        buildVisit('third', '2026-07-01'),
      ],
    });

    expect(actual).toHaveLength(2);
    expect(actual[1]).toMatchObject({ encounterId: 'third', ordinal: 2, visitCode: 'K2' });
  });

  it('keeps the code a closed visit was closed with, even when an earlier one is struck out', () => {
    const actual = numberAntenatalVisits({
      ...episode,
      visits: [
        buildVisit('cancelled', '2026-03-01', { isCancelled: true }),
        buildVisit('closed', '2026-05-01', { frozenVisitCode: 'K2' }),
      ],
    });

    expect(actual[0]).toMatchObject({ encounterId: 'closed', ordinal: 1, visitCode: 'K2' });
  });

  it('calls a booking after twelve weeks K1A', () => {
    const actual = numberAntenatalVisits({
      ...episode,
      visits: [buildVisit('late-booker', '2026-06-01')],
    });

    expect(actual[0]?.visitCode).toBe('K1A');
  });
});

describe('resolveDoctorVisitRequirements', () => {
  const episode = {
    lastMenstrualPeriodDate: INPUT_LMP,
    estimatedDeliveryDate: EXPECTED_EDD,
  };

  it('requires one doctor visit in trimester 1 and one in trimester 3', () => {
    const actual = resolveDoctorVisitRequirements({
      ...episode,
      inHouseDoctorVisitDates: [],
      externalDoctorVisits: [],
    });

    expect(actual.map((requirement) => requirement.trimester)).toEqual([1, 3]);
    expect(actual.every((requirement) => !requirement.isMet)).toBe(true);
  });

  it('counts a visit the mother made at another facility', () => {
    const actual = resolveDoctorVisitRequirements({
      ...episode,
      inHouseDoctorVisitDates: [],
      externalDoctorVisits: [
        {
          facilityName: 'RS Ibu dan Anak Melati',
          visitedAt: buildDate('2026-04-14'),
          isUltrasoundDone: true,
        },
      ],
    });

    expect(actual[0]).toMatchObject({ trimester: 1, isMet: true, isUltrasoundRecorded: true });
  });

  it('counts an in-house doctor visit as met, with the ultrasound unevidenced', () => {
    const actual = resolveDoctorVisitRequirements({
      ...episode,
      inHouseDoctorVisitDates: [buildDate('2026-03-01')],
      externalDoctorVisits: [],
    });

    expect(actual[0]).toMatchObject({ trimester: 1, isMet: true, isUltrasoundRecorded: false });
  });
});

describe('buildTrimesterSchedule', () => {
  const doctorVisits = [
    { trimester: 1 as const, isMet: false, isUltrasoundRecorded: false },
    { trimester: 3 as const, isMet: false, isUltrasoundRecorded: false },
  ];

  function buildNumberedVisit(trimester: 1 | 2 | 3, index: number) {
    return {
      encounterId: `visit-${trimester}-${index}`,
      ordinal: index,
      visitCode: null,
      trimester,
    };
  }

  it('reads a trimester with its visits done as DONE', () => {
    const actual = buildTrimesterSchedule({
      visits: [buildNumberedVisit(1, 1)],
      currentGestationalAge: { weeks: 10, days: 0 },
      doctorVisits,
    });

    expect(actual[0]).toMatchObject({ trimester: 1, state: 'DONE', completedVisitCount: 1 });
  });

  it('reads a shortfall inside the window as DUE, not as MISSED', () => {
    const actual = buildTrimesterSchedule({
      visits: [buildNumberedVisit(2, 1)],
      currentGestationalAge: { weeks: 20, days: 0 },
      doctorVisits,
    });

    expect(actual[1]).toMatchObject({ trimester: 2, state: 'DUE' });
  });

  it('reads a shortfall as MISSED once the window has closed', () => {
    const actual = buildTrimesterSchedule({
      visits: [buildNumberedVisit(2, 1)],
      currentGestationalAge: { weeks: 25, days: 0 },
      doctorVisits,
    });

    expect(actual[1]).toMatchObject({ trimester: 2, state: 'MISSED' });
  });

  it('never calls trimester 3 MISSED while the pregnancy is still running', () => {
    const actual = buildTrimesterSchedule({
      visits: [],
      currentGestationalAge: { weeks: 41, days: 0 },
      doctorVisits,
    });

    expect(actual[2]).toMatchObject({ trimester: 3, state: 'DUE' });
  });

  it('carries the doctor-visit requirement on trimesters 1 and 3 only', () => {
    const actual = buildTrimesterSchedule({
      visits: [],
      currentGestationalAge: { weeks: 10, days: 0 },
      doctorVisits,
    });

    expect(actual[0]?.doctorVisit).not.toBeNull();
    expect(actual[1]?.doctorVisit).toBeNull();
    expect(actual[2]?.doctorVisit).not.toBeNull();
  });

  it('shows the doctor visit as still owed even when the visit count is complete', () => {
    const actual = buildTrimesterSchedule({
      visits: [buildNumberedVisit(1, 1)],
      currentGestationalAge: { weeks: 10, days: 0 },
      doctorVisits,
    });

    expect(actual[0]).toMatchObject({ state: 'DONE', doctorVisit: { isMet: false } });
  });
});
