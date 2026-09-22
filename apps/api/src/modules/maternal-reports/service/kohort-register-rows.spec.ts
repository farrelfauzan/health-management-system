import {
  KOHORT_BAYI_COLUMNS,
  KOHORT_IBU_COLUMNS,
  KOHORT_KB_COLUMNS,
  MaternalReportEpisodeSource,
  MaternalReportPatientSource,
  buildKohortBayiRows,
  buildKohortIbuRows,
  buildKohortKbRows,
  groupRegisterRowsByVillage,
  listRegisterVillages,
  resolveMaternalReportMonthRange,
} from '@hms/shared-types';

const RANGE = resolveMaternalReportMonthRange('2026-10', 'Asia/Jakarta');

function readFirstRow<TRow>(rows: readonly TRow[]): TRow {
  const [row] = rows;
  if (row === undefined) {
    throw new Error('Expected one row');
  }
  return row;
}

function buildPatient(
  overrides: Partial<MaternalReportPatientSource>,
): MaternalReportPatientSource {
  return {
    id: 'patient-1',
    fullName: 'Siti Aminah',
    nikLast4: '1234',
    dateOfBirth: new Date('1996-03-10T00:00:00.000Z'),
    address: 'Jl. Melati No. 3',
    villageCode: '32.73.11.1001',
    villageName: 'Cihaurgeulis',
    hasBpjsNumber: true,
    ...overrides,
  };
}

function buildEpisode(
  overrides: Partial<MaternalReportEpisodeSource>,
): MaternalReportEpisodeSource {
  return {
    id: 'episode-1',
    patient: buildPatient({}),
    estimatedDeliveryDate: new Date('2026-11-09T00:00:00.000Z'),
    gravida: 2,
    para: 1,
    abortus: 0,
    bloodType: 'O',
    rhesus: '+',
    riskNotes: null,
    antenatalVisits: [
      {
        pregnancyEpisodeId: 'episode-1',
        visitCode: 'K1M',
        startedAt: new Date('2026-03-12T03:00:00.000Z'),
        heightCm: 156,
        muacCm: 24.5,
        tetanusStatus: 'T2',
        counsellingTopics: ['Gizi'],
        caseManagementNotes: null,
        labResults: [
          {
            testCode: 'HB',
            loincCode: '718-7',
            valueNumeric: 11.2,
            valueCoded: null,
            valueText: null,
          },
        ],
      },
      {
        pregnancyEpisodeId: 'episode-1',
        visitCode: 'K4',
        startedAt: new Date('2026-10-31T16:30:00.000Z'),
        heightCm: null,
        muacCm: 25,
        tetanusStatus: null,
        counsellingTopics: ['ASI'],
        caseManagementNotes: null,
        labResults: [],
      },
    ],
    delivery: null,
    postnatalVisits: [],
    postpartumFamilyPlanningMethod: null,
    ...overrides,
  };
}

describe('Kohort register rows (P25-T15)', () => {
  it('lays a kohort ibu row out in the 53 configured columns', () => {
    const row = readFirstRow(buildKohortIbuRows([buildEpisode({})], RANGE));
    const cell = (field: string): string =>
      row.values[KOHORT_IBU_COLUMNS.findIndex((column) => column.field === field)] ?? '';

    expect(KOHORT_IBU_COLUMNS).toHaveLength(53);
    expect(row.values).toHaveLength(53);
    expect(cell('no')).toBe('1');
    expect(cell('nik')).toBe('****1234');
    expect(cell('address')).toBe('Cihaurgeulis');
    expect(cell('payer')).toBe('JKN');
    expect(cell('motherAge')).toBe('30 tahun');
    expect(cell('gpa')).toBe('G2P1A0');
    expect(cell('estimatedDeliveryDate')).toBe('09/11/2026');
    expect(cell('heightCm')).toBe('156');
    expect(cell('muacCm')).toBe('25');
    expect(cell('tetanusStatus')).toBe('T2');
    expect(cell('haemoglobin')).toBe('11.2');
    expect(cell('bloodType')).toBe('O+');
    expect(cell('counselling')).toBe('Gizi, ASI');
    expect(cell('visitMar')).toBe('K1M');
    // 23:30 WIB on 31 October reads in the October cell, not November's.
    expect(cell('visitOct')).toBe('K4');
    expect(cell('visitNov')).toBe('');
    expect(cell('birthDateOutcome')).toBe('');
  });

  it('prints the delivery, the newborn weights and the KF dates', () => {
    const row = readFirstRow(
      buildKohortIbuRows(
        [
          buildEpisode({
            delivery: {
              birthAt: new Date('2026-10-20T16:59:00.000Z'),
              mode: 'SPONTANEOUS_VAGINAL',
              attendantName: 'Bidan Sari',
              perinealTearGrade: 'GRADE_2',
              referredOut: false,
              referralReason: null,
              newborns: [
                {
                  id: 'baby-1',
                  outcome: 'LIVE_BIRTH',
                  sex: 'FEMALE',
                  fullName: null,
                  nikLast4: null,
                  birthWeightGrams: 2400,
                  lengthCm: 47,
                  imdStartedAt: null,
                  vitaminK1GivenAt: null,
                  eyeProphylaxisGivenAt: null,
                  hb0GivenAt: null,
                  shkSampleTakenAt: null,
                  shkResult: null,
                },
              ],
            },
            postnatalVisits: [
              {
                pregnancyEpisodeId: 'episode-1',
                newbornCareRecordId: null,
                subject: 'MOTHER',
                visitCode: 'KF1',
                startedAt: new Date('2026-10-21T02:00:00.000Z'),
                caseManagementNote: 'Perineum baik',
              },
            ],
            postpartumFamilyPlanningMethod: 'IUD',
          }),
        ],
        RANGE,
      ),
    );
    const cell = (field: string): string =>
      row.values[KOHORT_IBU_COLUMNS.findIndex((column) => column.field === field)] ?? '';

    expect(cell('birthDateOutcome')).toBe('20/10/2026 / Hidup');
    expect(cell('birthWeightLow')).toBe('2400');
    expect(cell('birthWeightNormal')).toBe('');
    expect(cell('deliveryMode')).toBe('Normal (spontan)');
    expect(cell('attendant')).toBe('Bidan Sari');
    expect(cell('deliveryComplication')).toBe('Robekan GRADE_2');
    expect(cell('kf1')).toBe('21/10/2026');
    expect(cell('kf2')).toBe('');
    expect(cell('postpartumFamilyPlanning')).toBe('IUD/AKDR');
    expect(cell('postnatalCaseManagement')).toBe('Perineum baik');
  });

  it('groups rows by village with "Tanpa desa" last, and filters to one village', () => {
    const rows = buildKohortIbuRows(
      [
        buildEpisode({
          id: 'e-none',
          patient: buildPatient({ villageCode: null, villageName: null }),
        }),
        buildEpisode({
          id: 'e-b',
          patient: buildPatient({ villageCode: 'B', villageName: 'Sukaluyu' }),
        }),
        buildEpisode({
          id: 'e-a1',
          patient: buildPatient({ villageCode: 'A', villageName: 'Cihaurgeulis' }),
        }),
        buildEpisode({
          id: 'e-a2',
          patient: buildPatient({ villageCode: 'A', villageName: 'Cihaurgeulis' }),
        }),
      ],
      RANGE,
    );

    const unfiltered = groupRegisterRowsByVillage(rows, null);
    const filtered = groupRegisterRowsByVillage(rows, 'A');

    expect(unfiltered.map((group) => [group.villageName, group.rows.length])).toEqual([
      ['Cihaurgeulis', 2],
      ['Sukaluyu', 1],
      ['Tanpa desa', 1],
    ]);
    expect(unfiltered[0]?.rows.map((row) => row.values[0])).toEqual(['1', '2']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.rows.map((row) => row.id)).toEqual(['e-a1', 'e-a2']);
    expect(listRegisterVillages(rows)).toEqual([
      { code: 'A', name: 'Cihaurgeulis' },
      { code: 'B', name: 'Sukaluyu' },
      { code: null, name: 'Tanpa desa' },
    ]);
  });

  it('lays a kohort bayi row out in the provisional columns', () => {
    const row = readFirstRow(
      buildKohortBayiRows(
        [
          {
            newborn: {
              id: 'baby-1',
              outcome: 'LIVE_BIRTH',
              sex: 'MALE',
              fullName: null,
              nikLast4: null,
              birthWeightGrams: 3100,
              lengthCm: 49,
              imdStartedAt: new Date('2026-10-02T01:10:00.000Z'),
              vitaminK1GivenAt: new Date('2026-10-02T01:30:00.000Z'),
              eyeProphylaxisGivenAt: null,
              hb0GivenAt: new Date('2026-10-02T02:00:00.000Z'),
              shkSampleTakenAt: new Date('2026-10-04T02:00:00.000Z'),
              shkResult: 'NORMAL',
            },
            birthAt: new Date('2026-10-02T01:00:00.000Z'),
            mother: buildPatient({}),
            postnatalVisits: [
              {
                pregnancyEpisodeId: 'episode-1',
                newbornCareRecordId: 'baby-1',
                subject: 'NEWBORN',
                visitCode: 'KN1',
                startedAt: new Date('2026-10-03T02:00:00.000Z'),
                caseManagementNote: null,
              },
            ],
          },
        ],
        RANGE,
      ),
    );

    expect(row.values).toHaveLength(KOHORT_BAYI_COLUMNS.length);
    expect(row.values.slice(0, 5)).toEqual(['1', 'Bayi Ny. Siti Aminah', '', '02/10/2026', 'L']);
    expect(row.values[KOHORT_BAYI_COLUMNS.findIndex((column) => column.field === 'hb0')]).toBe(
      '02/10/2026',
    );
    expect(row.values[KOHORT_BAYI_COLUMNS.findIndex((column) => column.field === 'kn1')]).toBe(
      '03/10/2026',
    );
    expect(row.values[KOHORT_BAYI_COLUMNS.findIndex((column) => column.field === 'kn2')]).toBe('');
    expect(
      row.values[KOHORT_BAYI_COLUMNS.findIndex((column) => column.field === 'shkResult')],
    ).toBe('Normal');
  });

  it("lays a kohort KB row out with this month's services", () => {
    const row = readFirstRow(
      buildKohortKbRows(
        [
          {
            id: 'course-1',
            patient: buildPatient({}),
            method: 'INJECTABLE_3_MONTH',
            acceptorType: 'NEW',
            startedOn: new Date('2026-10-03T00:00:00.000Z'),
            nextDueOn: new Date('2026-12-26T00:00:00.000Z'),
            discontinuedOn: null,
            discontinuationReason: null,
            sideEffects: null,
            isPostpartum: true,
            providerName: 'Bidan Sari',
            services: [
              {
                servedOn: new Date('2026-09-20T00:00:00.000Z'),
                action: 'Konseling',
                nextDueOn: null,
              },
              {
                servedOn: new Date('2026-10-10T00:00:00.000Z'),
                action: 'Kontrol',
                nextDueOn: null,
              },
            ],
          },
        ],
        RANGE,
      ),
    );
    const cell = (field: string): string =>
      row.values[KOHORT_KB_COLUMNS.findIndex((column) => column.field === field)] ?? '';

    expect(row.values).toHaveLength(KOHORT_KB_COLUMNS.length);
    expect(cell('method')).toBe('Suntik 3 bulan');
    expect(cell('acceptorType')).toBe('Baru');
    expect(cell('postpartum')).toBe('Ya');
    expect(cell('servicesThisMonth')).toBe('03/10/2026: Mulai Suntik 3 bulan; 10/10/2026: Kontrol');
    expect(cell('nextDueOn')).toBe('26/12/2026');
  });
});
