import {
  MaternalReportDeathSource,
  MaternalReportPatientSource,
  buildBirthsDeathsReport,
  classifyDeathPatient,
  resolveMaternalReportMonthRange,
} from '@hms/shared-types';

const RANGE = resolveMaternalReportMonthRange('2026-10', 'Asia/Jakarta');

function buildPatient(
  overrides: Partial<MaternalReportPatientSource>,
): MaternalReportPatientSource {
  return {
    id: 'p',
    fullName: 'Ibu Rina',
    nikLast4: null,
    dateOfBirth: new Date('1994-06-01T00:00:00.000Z'),
    address: 'Jl. Mawar',
    villageCode: null,
    villageName: null,
    hasBpjsNumber: false,
    ...overrides,
  };
}

function buildDeath(overrides: Partial<MaternalReportDeathSource>): MaternalReportDeathSource {
  return {
    admissionId: 'adm-1',
    patient: buildPatient({}),
    dischargedAt: new Date('2026-10-12T03:20:00.000Z'),
    isRegisteredNewborn: false,
    pregnancyEndDates: [],
    ...overrides,
  };
}

describe('Births and deaths report (P25-T15, FR-RPT-03)', () => {
  it('classifies a registered newborn, a mother within 42 days of delivery, and another patient', () => {
    expect(classifyDeathPatient(buildDeath({ isRegisteredNewborn: true }))).toBe('NEWBORN');
    expect(
      classifyDeathPatient(
        buildDeath({
          patient: buildPatient({ dateOfBirth: new Date('2026-10-10T00:00:00.000Z') }),
        }),
      ),
    ).toBe('NEWBORN');
    expect(
      classifyDeathPatient(
        buildDeath({ pregnancyEndDates: [new Date('2026-09-05T00:00:00.000Z')] }),
      ),
    ).toBe('MOTHER');
    expect(classifyDeathPatient(buildDeath({ pregnancyEndDates: [null] }))).toBe('MOTHER');
    expect(
      classifyDeathPatient(
        buildDeath({ pregnancyEndDates: [new Date('2026-07-01T00:00:00.000Z')] }),
      ),
    ).toBe('OTHER');
  });

  it('lists a stillbirth and a newborn discharged DIED in October, and drops the November ones', () => {
    const actual = buildBirthsDeathsReport({
      range: RANGE,
      deliveries: [
        {
          birthAt: new Date('2026-10-31T16:59:00.000Z'),
          mode: 'SPONTANEOUS_VAGINAL',
          attendantName: 'Bidan Sari',
          perinealTearGrade: 'NONE',
          referredOut: false,
          referralReason: null,
          mother: buildPatient({ fullName: 'Siti Aminah', villageName: 'Cihaurgeulis' }),
          newborns: [
            {
              id: 'baby-live',
              outcome: 'LIVE_BIRTH',
              sex: 'FEMALE',
              fullName: null,
              nikLast4: null,
              birthWeightGrams: 3000,
              lengthCm: null,
              imdStartedAt: null,
              vitaminK1GivenAt: null,
              eyeProphylaxisGivenAt: null,
              hb0GivenAt: null,
              shkSampleTakenAt: null,
              shkResult: null,
            },
            {
              id: 'baby-still',
              outcome: 'STILLBIRTH',
              sex: 'MALE',
              fullName: null,
              nikLast4: null,
              birthWeightGrams: 2100,
              lengthCm: null,
              imdStartedAt: null,
              vitaminK1GivenAt: null,
              eyeProphylaxisGivenAt: null,
              hb0GivenAt: null,
              shkSampleTakenAt: null,
              shkResult: null,
            },
          ],
        },
        {
          birthAt: new Date('2026-10-31T17:00:00.000Z'),
          mode: 'CAESAREAN',
          attendantName: 'dr. Budi',
          perinealTearGrade: 'NONE',
          referredOut: false,
          referralReason: null,
          mother: buildPatient({}),
          newborns: [],
        },
      ],
      deaths: [
        buildDeath({
          admissionId: 'adm-baby',
          isRegisteredNewborn: true,
          patient: buildPatient({
            fullName: 'Bayi Ny. Rina',
            dateOfBirth: new Date('2026-10-10T00:00:00.000Z'),
          }),
        }),
        buildDeath({ admissionId: 'adm-nov', dischargedAt: new Date('2026-11-02T03:00:00.000Z') }),
      ],
    });

    expect(actual.summary).toEqual({
      liveBirths: 1,
      stillbirths: 1,
      maternalDeaths: 0,
      newbornDeaths: 1,
      otherDeaths: 0,
    });
    expect(actual.births.map((birth) => birth.outcome)).toEqual(['LIVE_BIRTH', 'STILLBIRTH']);
    expect(actual.deaths).toEqual([
      expect.objectContaining({ id: 'adm-baby', patientKind: 'NEWBORN', ageLabel: '2 hari' }),
    ]);
  });
});
