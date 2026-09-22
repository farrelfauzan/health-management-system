import {
  NonCapitationAntenatalSource,
  NonCapitationDeliverySource,
  NonCapitationFamilyPlanningSource,
  NonCapitationPostnatalSource,
  NonCapitationRecapSources,
  NonCapitationTariffSource,
  addMonthsToCalendarDate,
  buildNonCapitationRecapLines,
  resolveNonCapitationClaimStatus,
  resolveNonCapitationFilingDeadline,
  summarizeNonCapitationRecap,
} from '@hms/shared-types';

const TIME_ZONE = 'Asia/Jakarta';
const PATIENT = { id: 'mother-1', fullName: 'Siti Aminah', bpjsNumberLast4: '4821' };

function buildTariff(
  serviceType: NonCapitationTariffSource['serviceType'],
  amount: number,
  validFrom = '2023-01-09',
  validUntil: string | null = null,
): NonCapitationTariffSource {
  return {
    id: `${serviceType}-${validFrom}`,
    serviceType,
    amount,
    validFrom,
    validUntil,
    regulationReference: `Permenkes 3/2023 ${serviceType}`,
  };
}

const TARIFFS: NonCapitationTariffSource[] = [
  buildTariff('ANTENATAL_MIDWIFE', 70000),
  buildTariff('ANTENATAL_DOCTOR', 90000),
  buildTariff('ANTENATAL_DOCTOR_ULTRASOUND', 160000),
  buildTariff('PRE_REFERRAL', 200000),
  buildTariff('DELIVERY_WITH_DOCTOR', 1200000),
  buildTariff('DELIVERY_HEALTH_WORKER_TEAM', 800000),
  buildTariff('POSTNATAL_MOTHER_NEWBORN', 50000),
  buildTariff('POSTNATAL_MOTHER', 50000),
  buildTariff('FAMILY_PLANNING_IUD', 105000),
  buildTariff('FAMILY_PLANNING_IMPLANT', 105000),
  buildTariff('FAMILY_PLANNING_INJECTION', 20000),
];

function buildAntenatal(
  index: number,
  overrides: Partial<NonCapitationAntenatalSource> = {},
): NonCapitationAntenatalSource {
  return {
    antenatalVisitId: `anc-${String(index)}`,
    encounterId: `anc-encounter-${String(index)}`,
    startedAt: new Date(`2026-10-${String(index + 10).padStart(2, '0')}T09:00:00+07:00`),
    visitCode: 'K2',
    examinerProfession: 'MIDWIFE',
    hasUltrasound: false,
    hasReferral: false,
    patient: { ...PATIENT, id: `mother-${String(index)}` },
    ...overrides,
  };
}

function buildDelivery(
  index: number,
  overrides: Partial<NonCapitationDeliverySource> = {},
): NonCapitationDeliverySource {
  return {
    deliveryRecordId: `delivery-${String(index)}`,
    birthAt: new Date(`2026-10-0${String(index + 1)}T03:00:00+07:00`),
    admissionId: `admission-${String(index)}`,
    attendantProfession: 'MIDWIFE',
    newbornPatientIds: [`baby-${String(index)}`],
    patient: PATIENT,
    ...overrides,
  };
}

function buildPostnatal(
  index: number,
  visitCode: NonCapitationPostnatalSource['visitCode'],
): NonCapitationPostnatalSource {
  return {
    postnatalVisitId: `pnc-${String(index)}`,
    encounterId: `pnc-encounter-${String(index)}`,
    startedAt: new Date(`2026-10-2${String(index)}T10:00:00+07:00`),
    visitCode,
    examinerProfession: 'MIDWIFE',
    hasReferral: false,
    patient: PATIENT,
  };
}

function buildFamilyPlanning(
  overrides: Partial<NonCapitationFamilyPlanningSource>,
): NonCapitationFamilyPlanningSource {
  return {
    sourceId: 'kb-1',
    kind: 'COURSE_START',
    method: 'IUD',
    acceptorType: 'NEW',
    servedOn: new Date('2026-10-15T00:00:00.000Z'),
    encounterId: null,
    setsNextDueDate: false,
    examinerProfession: 'MIDWIFE',
    patient: PATIENT,
    ...overrides,
  };
}

function buildSources(
  overrides: Partial<NonCapitationRecapSources> = {},
): NonCapitationRecapSources {
  return {
    antenatal: [],
    postnatal: [],
    deliveries: [],
    familyPlanning: [],
    documents: [],
    tariffs: TARIFFS,
    marks: [],
    ...overrides,
  };
}

const NOVEMBER_SIXTH = { timeZone: TIME_ZONE, today: '2026-11-06', filingDeadline: '2026-11-10' };

describe('BPJS non-capitation recap lines (P25-T16)', () => {
  it('lists 12 lines at the verified tariffs, all DUE_SOON on 6 Nov for a 10 Nov deadline', () => {
    const inputSources = buildSources({
      antenatal: [0, 1, 2, 3, 4, 5].map((index) => buildAntenatal(index)),
      deliveries: [
        buildDelivery(0),
        buildDelivery(1, {
          attendantProfession: 'DOCTOR',
          patient: { ...PATIENT, id: 'mother-9' },
        }),
      ],
      postnatal: [
        buildPostnatal(1, 'KF1'),
        buildPostnatal(2, 'KF2'),
        buildPostnatal(3, 'KF3'),
        buildPostnatal(4, 'KF4'),
      ],
    });

    const actualLines = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLines).toHaveLength(12);
    expect(actualLines.every((line) => line.status === 'DUE_SOON')).toBe(true);
    expect(actualLines.filter((line) => line.serviceType === 'ANTENATAL_MIDWIFE')).toHaveLength(6);
    expect(
      actualLines
        .filter((line) => line.serviceType.startsWith('DELIVERY'))
        .map((line) => [line.serviceType, line.tariffAmount]),
    ).toEqual(
      expect.arrayContaining([
        ['DELIVERY_HEALTH_WORKER_TEAM', 800000],
        ['DELIVERY_WITH_DOCTOR', 1200000],
      ]),
    );
    expect(actualLines.find((line) => line.visitLabel === 'KF4')?.serviceType).toBe(
      'POSTNATAL_MOTHER',
    );
    expect(actualLines.find((line) => line.visitLabel === 'KF1')?.serviceType).toBe(
      'POSTNATAL_MOTHER_NEWBORN',
    );
  });

  it('prices each line at the tariff valid on its service date across a validFrom change', () => {
    const inputSources = buildSources({
      antenatal: [
        buildAntenatal(0, { startedAt: new Date('2026-10-14T23:30:00+07:00') }),
        buildAntenatal(1, { startedAt: new Date('2026-10-15T00:10:00+07:00') }),
      ],
      tariffs: [
        buildTariff('ANTENATAL_MIDWIFE', 70000, '2023-01-09', '2026-10-14'),
        buildTariff('ANTENATAL_MIDWIFE', 75000, '2026-10-15'),
      ],
    });

    const actualLines = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLines.map((line) => [line.serviceDate, line.tariffAmount])).toEqual([
      ['2026-10-14', 70000],
      ['2026-10-15', 75000],
    ]);
  });

  it('reads the service date in the clinic timezone, not UTC', () => {
    const inputSources = buildSources({
      antenatal: [buildAntenatal(0, { startedAt: new Date('2026-10-31T17:30:00.000Z') })],
    });

    const [actualLine] = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLine?.serviceDate).toBe('2026-11-01');
  });

  it('leaves a line unpriced when no tariff is valid on its date', () => {
    const inputSources = buildSources({ antenatal: [buildAntenatal(0)], tariffs: [] });

    const [actualLine] = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLine?.tariffAmount).toBeNull();
    expect(actualLine?.regulationReference).toBeNull();
  });

  it('prices a doctor ANC with ultrasound and adds a pra rujukan line for a referral', () => {
    const inputSources = buildSources({
      antenatal: [
        buildAntenatal(0, { examinerProfession: 'DOCTOR', hasUltrasound: true, hasReferral: true }),
        buildAntenatal(1, { examinerProfession: 'DOCTOR' }),
      ],
    });

    const actualLines = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLines.map((line) => [line.serviceType, line.tariffAmount])).toEqual([
      ['ANTENATAL_DOCTOR_ULTRASOUND', 160000],
      ['PRE_REFERRAL', 200000],
      ['ANTENATAL_DOCTOR', 90000],
    ]);
  });

  it('claims an AKDR or implant inserted here and every injection, nothing else', () => {
    const inputSources = buildSources({
      familyPlanning: [
        buildFamilyPlanning({ sourceId: 'iud-new' }),
        buildFamilyPlanning({ sourceId: 'iud-continuing', acceptorType: 'CONTINUING' }),
        buildFamilyPlanning({ sourceId: 'implant-new', method: 'IMPLANT' }),
        buildFamilyPlanning({
          sourceId: 'injection-start',
          method: 'INJECTABLE_3_MONTH',
          acceptorType: 'CONTINUING',
        }),
        buildFamilyPlanning({
          sourceId: 'reinjection',
          method: 'INJECTABLE_3_MONTH',
          kind: 'SERVICE',
          setsNextDueDate: true,
        }),
        buildFamilyPlanning({
          sourceId: 'injectable-check-up',
          method: 'INJECTABLE_1_MONTH',
          kind: 'SERVICE',
        }),
        buildFamilyPlanning({ sourceId: 'pill', method: 'PILL' }),
      ],
    });

    const actualLines = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLines.map((line) => [line.sourceId, line.serviceType]).sort()).toEqual(
      [
        ['iud-new', 'FAMILY_PLANNING_IUD'],
        ['implant-new', 'FAMILY_PLANNING_IMPLANT'],
        ['injection-start', 'FAMILY_PLANNING_INJECTION'],
        ['reinjection', 'FAMILY_PLANNING_INJECTION'],
      ].sort(),
    );
  });

  it('checks documents on the line, on its stay, or unattached and dated after the service', () => {
    const inputSources = buildSources({
      deliveries: [buildDelivery(0)],
      documents: [
        {
          patientId: PATIENT.id,
          encounterId: null,
          admissionId: 'admission-0',
          category: 'PARTOGRAPH',
          filedOn: '2026-10-01',
        },
        {
          patientId: 'baby-0',
          encounterId: null,
          admissionId: null,
          category: 'BIRTH_CERTIFICATE',
          filedOn: '2026-10-03',
        },
        {
          patientId: PATIENT.id,
          encounterId: 'other-visit',
          admissionId: null,
          category: 'KIA_BOOK_COPY',
          filedOn: '2026-10-02',
        },
      ],
    });

    const [actualLine] = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLine?.documents).toEqual([
      { category: 'KIA_BOOK_COPY', isPresent: false },
      { category: 'PARTOGRAPH', isPresent: true },
      { category: 'BIRTH_CERTIFICATE', isPresent: true },
    ]);
    expect(actualLine?.isDocumentationComplete).toBe(false);
  });

  it('shows a marked line as SENT and takes it out of the flags', () => {
    const inputSources = buildSources({
      antenatal: [buildAntenatal(0)],
      marks: [
        {
          serviceType: 'ANTENATAL_MIDWIFE',
          sourceId: 'anc-0',
          markedAt: new Date('2026-11-05T02:00:00.000Z'),
        },
      ],
    });

    const [actualLine] = buildNonCapitationRecapLines(inputSources, NOVEMBER_SIXTH);

    expect(actualLine?.status).toBe('SENT');
    expect(actualLine?.markedAt).toBe('2026-11-05T02:00:00.000Z');
  });
});

describe('BPJS non-capitation deadline and status (P25-T16)', () => {
  it.each([
    ['2026-11-04', 'OPEN'],
    ['2026-11-05', 'DUE_SOON'],
    ['2026-11-10', 'DUE_SOON'],
    ['2026-11-11', 'LATE'],
    ['2027-04-15', 'EXPIRED'],
  ] as const)('on %s an unmarked 14 Oct line is %s', (today, expectedStatus) => {
    const actualStatus = resolveNonCapitationClaimStatus({
      isMarked: false,
      today,
      filingDeadline: '2026-11-10',
      expiresOn: addMonthsToCalendarDate('2026-10-14', 6),
    });

    expect(actualStatus).toBe(expectedStatus);
  });

  it('puts the filing date on the configured day of the following month', () => {
    expect(resolveNonCapitationFilingDeadline('2026-10', 10)).toBe('2026-11-10');
    expect(resolveNonCapitationFilingDeadline('2026-12', 5)).toBe('2027-01-05');
  });

  it('clamps the six-month expiry to the end of a shorter month', () => {
    expect(addMonthsToCalendarDate('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonthsToCalendarDate('2026-10-14', 6)).toBe('2027-04-14');
  });
});

describe('BPJS non-capitation summary (P25-T16)', () => {
  const inputLines = buildNonCapitationRecapLines(
    buildSources({
      antenatal: [buildAntenatal(0), buildAntenatal(1)],
      deliveries: [buildDelivery(0)],
    }),
    NOVEMBER_SIXTH,
  );

  it('totals per service type and shows the 10% ceiling for a non-government induk', () => {
    const actualTotals = summarizeNonCapitationRecap({
      lines: inputLines,
      isNetworkParentGovernmentOwned: false,
    });

    expect(actualTotals.totalAmount).toBe(940000);
    expect(actualTotals.maximumCoachingFeeAmount).toBe(94000);
    expect(actualTotals.summary).toEqual([
      { serviceType: 'ANTENATAL_MIDWIFE', count: 2, totalAmount: 140000 },
      { serviceType: 'DELIVERY_HEALTH_WORKER_TEAM', count: 1, totalAmount: 800000 },
    ]);
    expect(actualTotals.statusCounts.DUE_SOON).toBe(3);
  });

  it.each([true, null])(
    'shows no coaching-fee ceiling when ownership is %s',
    (isGovernmentOwned) => {
      const actualTotals = summarizeNonCapitationRecap({
        lines: inputLines,
        isNetworkParentGovernmentOwned: isGovernmentOwned,
      });

      expect(actualTotals.maximumCoachingFeeAmount).toBeNull();
    },
  );
});
