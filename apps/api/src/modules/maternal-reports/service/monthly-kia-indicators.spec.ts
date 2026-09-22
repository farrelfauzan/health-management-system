import {
  ANTENATAL_LAB_BLOCK_INDICATORS,
  MONTHLY_KIA_INDICATORS,
  MaternalReportAntenatalVisitSource,
  MaternalReportDeliverySource,
  MaternalReportFamilyPlanningSource,
  MaternalReportLabResultSource,
  MaternalReportPostnatalVisitSource,
  MonthlyKiaSource,
  computeMonthlyKiaIndicators,
  resolveMaternalReportMonthRange,
} from '@hms/shared-types';

/**
 * October 2026 in Asia/Jakarta: [2026-09-30T17:00Z, 2026-10-31T17:00Z).
 * The acceptance month of P25-T15: 12 K1 (4 K1A, 8 K1M), 5 deliveries, 3 new
 * injectable acceptors — with every boundary instant placed on purpose.
 */
const RANGE = resolveMaternalReportMonthRange('2026-10', 'Asia/Jakarta');
/** 23:59 WIB on 31 October: the last minute of the month. */
const LAST_MINUTE_WIB = new Date('2026-10-31T16:59:00.000Z');
/** 00:00 WIB on 1 November: the first minute of the next month. */
const FIRST_MINUTE_NEXT_MONTH_WIB = new Date('2026-10-31T17:00:00.000Z');
/** 00:00 WIB on 1 October. */
const FIRST_MINUTE_WIB = new Date('2026-09-30T17:00:00.000Z');
/** 23:59 WIB on 30 September. */
const LAST_MINUTE_PREVIOUS_MONTH_WIB = new Date('2026-09-30T16:59:00.000Z');

function buildVisit(
  overrides: Partial<MaternalReportAntenatalVisitSource> & { pregnancyEpisodeId: string },
): MaternalReportAntenatalVisitSource {
  return {
    visitCode: 'K2',
    startedAt: new Date('2026-10-10T03:00:00.000Z'),
    heightCm: null,
    muacCm: null,
    tetanusStatus: null,
    counsellingTopics: [],
    caseManagementNotes: null,
    labResults: [],
    ...overrides,
  };
}

function buildLab(
  overrides: Partial<MaternalReportLabResultSource>,
): MaternalReportLabResultSource {
  return {
    testCode: 'HB',
    loincCode: '718-7',
    valueNumeric: null,
    valueCoded: null,
    valueText: null,
    ...overrides,
  };
}

function buildDelivery(birthAt: Date): MaternalReportDeliverySource {
  return {
    birthAt,
    mode: 'SPONTANEOUS_VAGINAL',
    attendantName: 'Bidan Sari',
    perinealTearGrade: 'NONE',
    referredOut: false,
    referralReason: null,
    newborns: [],
  };
}

function buildPostnatal(
  overrides: Partial<MaternalReportPostnatalVisitSource> & { pregnancyEpisodeId: string },
): MaternalReportPostnatalVisitSource {
  return {
    newbornCareRecordId: null,
    subject: 'MOTHER',
    visitCode: 'KF1',
    startedAt: new Date('2026-10-05T03:00:00.000Z'),
    caseManagementNote: null,
    ...overrides,
  };
}

function buildCourse(
  overrides: Partial<MaternalReportFamilyPlanningSource> & { id: string },
): MaternalReportFamilyPlanningSource {
  return {
    patient: {
      id: `patient-${overrides.id}`,
      fullName: 'Ibu',
      nikLast4: null,
      dateOfBirth: new Date('1995-01-01T00:00:00.000Z'),
      address: 'Jl. Melati',
      villageCode: null,
      villageName: null,
      hasBpjsNumber: false,
    },
    method: 'INJECTABLE_3_MONTH',
    acceptorType: 'NEW',
    startedOn: new Date('2026-10-03T00:00:00.000Z'),
    nextDueOn: null,
    discontinuedOn: null,
    discontinuationReason: null,
    sideEffects: null,
    isPostpartum: false,
    providerName: 'Bidan Sari',
    services: [],
    ...overrides,
  };
}

function buildSource(overrides: Partial<MonthlyKiaSource>): MonthlyKiaSource {
  return {
    range: RANGE,
    antenatalVisits: [],
    deliveries: [],
    postnatalVisits: [],
    familyPlanning: [],
    hb0GivenAt: [],
    ...overrides,
  };
}

function readValue(source: MonthlyKiaSource, indicatorId: string): number {
  const values = computeMonthlyKiaIndicators(
    [...MONTHLY_KIA_INDICATORS, ...ANTENATAL_LAB_BLOCK_INDICATORS],
    source,
  );
  const match = values.find((value) => value.id === indicatorId);
  if (match === undefined) {
    throw new Error(`No indicator ${indicatorId}`);
  }
  return match.value;
}

describe('Monthly KIA indicators (P25-T15)', () => {
  const acceptanceSource = buildSource({
    antenatalVisits: [
      ...Array.from({ length: 4 }, (_, index) =>
        buildVisit({ pregnancyEpisodeId: `akses-${index}`, visitCode: 'K1A' }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        buildVisit({ pregnancyEpisodeId: `murni-${index}`, visitCode: 'K1M' }),
      ),
      buildVisit({ pregnancyEpisodeId: 'k4-1', visitCode: 'K4' }),
      // Not yet closed: no code, never counted.
      buildVisit({ pregnancyEpisodeId: 'open-1', visitCode: null }),
      // The previous month's last minute, WIB.
      buildVisit({
        pregnancyEpisodeId: 'sept-1',
        visitCode: 'K1M',
        startedAt: LAST_MINUTE_PREVIOUS_MONTH_WIB,
      }),
    ],
    deliveries: [
      buildDelivery(FIRST_MINUTE_WIB),
      buildDelivery(new Date('2026-10-15T05:00:00.000Z')),
      buildDelivery(new Date('2026-10-20T05:00:00.000Z')),
      buildDelivery(new Date('2026-10-25T05:00:00.000Z')),
      buildDelivery(LAST_MINUTE_WIB),
      buildDelivery(FIRST_MINUTE_NEXT_MONTH_WIB),
    ],
    familyPlanning: [
      buildCourse({ id: 'inj-1' }),
      buildCourse({ id: 'inj-2', startedOn: new Date('2026-10-31T00:00:00.000Z') }),
      buildCourse({ id: 'inj-3', startedOn: new Date('2026-10-01T00:00:00.000Z') }),
      buildCourse({ id: 'inj-cont', acceptorType: 'CONTINUING' }),
      buildCourse({ id: 'inj-nov', startedOn: new Date('2026-11-01T00:00:00.000Z') }),
      buildCourse({ id: 'pill-1', method: 'PILL' }),
    ],
  });

  it.each([
    ['k1', 12],
    ['k1Akses', 4],
    ['k1Murni', 8],
    ['k4', 1],
    ['k6', 0],
    ['deliveriesByHealthWorker', 5],
    ['kbNew_INJECTABLE_3_MONTH', 3],
    ['kbNew_PILL', 1],
    ['kbActive_INJECTABLE_3_MONTH', 4],
    ['labBumilK1', 12],
    ['labBumilK4', 1],
  ])('counts %s = %i for the acceptance month', (indicatorId, expected) => {
    expect(readValue(acceptanceSource, indicatorId)).toBe(expected);
  });

  it('keeps a delivery at 23:59 WIB on the 31st and drops one at 00:00 WIB on 1 November', () => {
    const boundaries = buildSource({
      deliveries: [buildDelivery(LAST_MINUTE_WIB), buildDelivery(FIRST_MINUTE_NEXT_MONTH_WIB)],
    });

    expect(readValue(boundaries, 'deliveriesByHealthWorker')).toBe(1);
  });

  it('counts a KB course active on the last day, and not one discontinued that day', () => {
    const source = buildSource({
      familyPlanning: [
        buildCourse({
          id: 'live',
          startedOn: new Date('2026-05-01T00:00:00.000Z'),
          acceptorType: 'CONTINUING',
        }),
        buildCourse({
          id: 'ended',
          startedOn: new Date('2026-05-01T00:00:00.000Z'),
          discontinuedOn: new Date('2026-10-31T00:00:00.000Z'),
        }),
        buildCourse({
          id: 'ended-next-month',
          startedOn: new Date('2026-05-01T00:00:00.000Z'),
          discontinuedOn: new Date('2026-11-01T00:00:00.000Z'),
        }),
      ],
    });

    expect(readValue(source, 'kbActive_INJECTABLE_3_MONTH')).toBe(2);
    expect(readValue(source, 'kbNew_INJECTABLE_3_MONTH')).toBe(0);
  });

  it('counts KF lengkap in the month of the fourth visit and KN lengkap per baby', () => {
    const source = buildSource({
      postnatalVisits: [
        buildPostnatal({
          pregnancyEpisodeId: 'ep-1',
          visitCode: 'KF1',
          startedAt: new Date('2026-09-02T03:00:00.000Z'),
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-1',
          visitCode: 'KF2',
          startedAt: new Date('2026-09-06T03:00:00.000Z'),
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-1',
          visitCode: 'KF3',
          startedAt: new Date('2026-09-20T03:00:00.000Z'),
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-1',
          visitCode: 'KF4',
          startedAt: LAST_MINUTE_WIB,
        }),
        // Three of four: not complete.
        buildPostnatal({ pregnancyEpisodeId: 'ep-2', visitCode: 'KF1' }),
        buildPostnatal({ pregnancyEpisodeId: 'ep-2', visitCode: 'KF2' }),
        buildPostnatal({ pregnancyEpisodeId: 'ep-2', visitCode: 'KF3' }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-3',
          subject: 'NEWBORN',
          newbornCareRecordId: 'baby-1',
          visitCode: 'KN1',
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-3',
          subject: 'NEWBORN',
          newbornCareRecordId: 'baby-1',
          visitCode: 'KN2',
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-3',
          subject: 'NEWBORN',
          newbornCareRecordId: 'baby-1',
          visitCode: 'KN3',
        }),
        // A twin whose KN3 fell in November: November's figure.
        buildPostnatal({
          pregnancyEpisodeId: 'ep-3',
          subject: 'NEWBORN',
          newbornCareRecordId: 'baby-2',
          visitCode: 'KN1',
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-3',
          subject: 'NEWBORN',
          newbornCareRecordId: 'baby-2',
          visitCode: 'KN2',
        }),
        buildPostnatal({
          pregnancyEpisodeId: 'ep-3',
          subject: 'NEWBORN',
          newbornCareRecordId: 'baby-2',
          visitCode: 'KN3',
          startedAt: FIRST_MINUTE_NEXT_MONTH_WIB,
        }),
      ],
    });

    expect(readValue(source, 'kfComplete')).toBe(1);
    expect(readValue(source, 'kn1')).toBe(2);
    expect(readValue(source, 'knComplete')).toBe(1);
  });

  it('counts HB0 by the dose date, not the birth', () => {
    const source = buildSource({ hb0GivenAt: [LAST_MINUTE_WIB, FIRST_MINUTE_NEXT_MONTH_WIB] });

    expect(readValue(source, 'hb0')).toBe(1);
  });

  it('reads the LB3 laboratory block once per mother, by the latest result', () => {
    const source = buildSource({
      antenatalVisits: [
        buildVisit({
          pregnancyEpisodeId: 'ep-hb',
          visitCode: 'K1M',
          muacCm: 22.5,
          labResults: [
            buildLab({ valueNumeric: 10.2 }),
            buildLab({ testCode: 'HBSAG', loincCode: '5195-3', valueCoded: 'Non-reaktif' }),
            buildLab({ testCode: 'URPROT', loincCode: '5804-0', valueCoded: '+2' }),
            buildLab({ testCode: 'GDS', loincCode: '2345-7', valueNumeric: 210 }),
          ],
        }),
        buildVisit({
          pregnancyEpisodeId: 'ep-severe',
          visitCode: 'K1A',
          muacCm: 24,
          labResults: [
            buildLab({ valueNumeric: 7.9 }),
            buildLab({ testCode: 'ANTIHIV', loincCode: '75622-1', valueCoded: 'Reaktif' }),
          ],
        }),
        // Hb at K4 is a separate column and does not count toward K1.
        buildVisit({
          pregnancyEpisodeId: 'ep-k4',
          visitCode: 'K4',
          labResults: [buildLab({ valueNumeric: 9 })],
        }),
        // Two visits of one mother: examined once, the later value decides.
        buildVisit({
          pregnancyEpisodeId: 'ep-twice',
          visitCode: 'K1M',
          labResults: [buildLab({ valueNumeric: 7 })],
        }),
        buildVisit({
          pregnancyEpisodeId: 'ep-twice',
          visitCode: 'K1M',
          startedAt: new Date('2026-10-20T03:00:00.000Z'),
          labResults: [buildLab({ valueNumeric: 11.5 })],
        }),
      ],
    });

    expect(readValue(source, 'hbK1Examined')).toBe(3);
    expect(readValue(source, 'hbK1AnemiaMild')).toBe(1);
    expect(readValue(source, 'hbK1AnemiaSevere')).toBe(1);
    expect(readValue(source, 'hbK4AnemiaMild')).toBe(1);
    expect(readValue(source, 'kekExamined')).toBe(2);
    expect(readValue(source, 'kekPositive')).toBe(1);
    expect(readValue(source, 'proteinUrineExamined')).toBe(1);
    expect(readValue(source, 'proteinUrinePositive')).toBe(1);
    expect(readValue(source, 'glucosePositive')).toBe(1);
    expect(readValue(source, 'hbsagExamined')).toBe(1);
    expect(readValue(source, 'hbsagPositive')).toBe(0);
    expect(readValue(source, 'hivPositive')).toBe(1);
    expect(readValue(source, 'syphilisExamined')).toBe(0);
  });

  it('gives every indicator a unique id and a definition', () => {
    const all = [...MONTHLY_KIA_INDICATORS, ...ANTENATAL_LAB_BLOCK_INDICATORS];

    expect(new Set(all.map((indicator) => indicator.id)).size).toBe(all.length);
    expect(all.every((indicator) => indicator.definition.length > 20)).toBe(true);
  });
});
