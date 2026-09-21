const PREGNANCY_EPISODE_ID = '0d6f6c3a-6a0e-4a55-9a8d-2f1b7c8e5a01';
const ENCOUNTER_ID = '6b1f0a52-9c1d-4f0f-8f3e-2a6b1d9e7c11';
const BIRTH_AT = '2026-09-30T20:00:00.000Z';

const EXAMINATION = {
  vaginalBleeding: false,
  bloodLossMl: 50,
  perineumCondition: 'Jahitan utuh, tidak bengkak',
  perinealInfectionSigns: false,
  caesareanWoundInfectionSigns: null,
  breastCondition: 'NORMAL',
  uterineContraction: true,
  lochiaColour: 'SEROSA',
  lochiaOdour: false,
  breastMilkProduction: 'PRESENT',
  urination: true,
  defecation: true,
  newbornCareCounselling: true,
  vitaminAGivenAt: null,
  vitaminAMedicationId: null,
  familyPlanningCounselling: true,
};

/**
 * OpenAPI examples for nifas and neonatal visits (P25-T12). The birth is the
 * ticket's acceptance case: 1 October 03:00 WIB, a KF2 visit on 5 October.
 */
export const POSTNATAL_CARE_EXAMPLES = {
  schedule: {
    pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
    birthAt: BIRTH_AT,
    entries: [
      {
        code: 'KF1',
        subject: 'MOTHER',
        startsAt: '2026-10-01T02:00:00.000Z',
        endsAt: '2026-10-03T16:59:59.999Z',
        status: 'MISSED',
        fulfilledBy: null,
      },
      {
        code: 'KF2',
        subject: 'MOTHER',
        startsAt: '2026-10-03T17:00:00.000Z',
        endsAt: '2026-10-08T16:59:59.999Z',
        status: 'FULFILLED',
        fulfilledBy: { encounterId: ENCOUNTER_ID, startedAt: '2026-10-05T02:00:00.000Z' },
      },
    ],
  },
  linkRequest: { subject: 'MOTHER' },
  visit: {
    id: '9a3c2e11-1b7d-4d0a-9f55-3c2e8a7b6d21',
    encounterId: ENCOUNTER_ID,
    subject: 'MOTHER',
    pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
    newbornCareRecordId: null,
    visitCode: 'KF2',
    isCodeFrozen: false,
    birthAt: BIRTH_AT,
    examination: EXAMINATION,
  },
  examinationRequest: EXAMINATION,
};
