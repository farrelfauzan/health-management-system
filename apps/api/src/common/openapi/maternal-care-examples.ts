/**
 * Response examples for the pregnancy episode (P25-T06). The dates are the
 * ones US-ANC-01 tells the story with: HPHT 2 February 2026, a visit on
 * 23 August, which is 29 weeks and the third antenatal contact.
 */
const EPISODE_ID = '7c1d5e83-2a64-4f19-b8d3-91e4a6c05b72';
const PATIENT_ID = '4a9b2c71-8e35-4d02-a6f7-3b0c9d18e5a4';
const ENCOUNTER_ID = 'b2e7f409-6c13-4a85-9d27-5f8a0c3b1e69';

const EPISODE = {
  id: EPISODE_ID,
  patientId: PATIENT_ID,
  status: 'ACTIVE',
  lastMenstrualPeriodDate: '2026-02-02',
  estimatedDeliveryDate: '2026-11-09',
  eddSource: 'LMP',
  gravida: 2,
  para: 1,
  abortus: 0,
  gpaLabel: 'G2P1A0',
  prePregnancyWeightKg: 54.5,
  bloodType: 'O',
  rhesus: '+',
  riskNotes: null,
  endedAt: null,
  endReason: null,
  createdAt: '2026-03-10T02:00:00.000Z',
};

export const MATERNAL_CARE_EXAMPLES = {
  episode: EPISODE,
  endedEpisode: {
    ...EPISODE,
    status: 'ENDED',
    endedAt: '2026-12-07T00:00:00.000Z',
    endReason: 'LOST_TO_FOLLOW_UP',
  },
  activeEpisode: {
    episode: EPISODE,
    gestationalAge: { weeks: 29, days: 0 },
    currentTrimester: 3,
    visits: [
      {
        id: 'e5a1c07b-3d92-4c68-8f14-6b2d0e93a7c5',
        encounterId: ENCOUNTER_ID,
        startedAt: '2026-08-23T01:30:00.000Z',
        encounterStatus: 'IN_PROGRESS',
        ordinal: 3,
        visitCode: 'K3',
        trimester: 3,
        gestationalAge: { weeks: 29, days: 0 },
      },
    ],
    externalDoctorVisits: [
      {
        id: 'd3b8f512-4e07-4a91-b6c3-28d5019e7f4a',
        facilityName: 'RS Ibu dan Anak Melati',
        visitedAt: '2026-04-14',
        isUltrasoundDone: true,
      },
    ],
    schedule: [
      {
        trimester: 1,
        requiredVisitCount: 1,
        completedVisitCount: 1,
        state: 'DONE',
        doctorVisit: { trimester: 1, isMet: true, isUltrasoundRecorded: true },
      },
      {
        trimester: 2,
        requiredVisitCount: 2,
        completedVisitCount: 1,
        state: 'MISSED',
        doctorVisit: null,
      },
      {
        trimester: 3,
        requiredVisitCount: 3,
        completedVisitCount: 1,
        state: 'DUE',
        doctorVisit: { trimester: 3, isMet: false, isUltrasoundRecorded: false },
      },
    ],
  },
  encounterVisit: {
    encounterId: ENCOUNTER_ID,
    pregnancyEpisodeId: EPISODE_ID,
    ordinal: 3,
    visitCode: 'K3',
    gestationalAge: { weeks: 29, days: 0 },
  },
  examination: {
    examination: {
      muacCm: 24.5,
      fundalHeightCm: 28,
      fetalHeartRateBpm: 148,
      fetalPresentation: 'CEPHALIC',
      fetalHeadEngagement: 'NOT_ENGAGED',
      fetalCount: 1,
      estimatedFetalWeightGrams: 1550,
      tetanusStatus: 'T2',
      ironTabletsGiven: 30,
      counsellingTopics: ['Tanda bahaya kehamilan', 'Persiapan persalinan'],
      caseManagementNotes: null,
    },
    checklist: [
      { code: 'WEIGHT_AND_HEIGHT', source: 'VITAL_SIGNS', isDone: true },
      { code: 'BLOOD_PRESSURE', source: 'VITAL_SIGNS', isDone: true },
      { code: 'MUAC', source: 'EXAMINATION', isDone: true },
      { code: 'FUNDAL_HEIGHT', source: 'EXAMINATION', isDone: true },
      { code: 'FETAL_PRESENTATION_AND_HEART_RATE', source: 'EXAMINATION', isDone: true },
      { code: 'TETANUS_IMMUNIZATION', source: 'IMMUNIZATION', isDone: false },
      { code: 'IRON_TABLETS', source: 'PRESCRIPTION', isDone: true },
      { code: 'LABORATORY', source: 'LAB_ORDER', isDone: true },
      { code: 'CASE_MANAGEMENT', source: 'EXAMINATION', isDone: false },
      { code: 'COUNSELLING', source: 'EXAMINATION', isDone: true },
    ],
    // Empty until the Pedoman's thresholds can be read from a primary source
    // (P25-T07): the mechanism ships, the rule list does not.
    referralRules: [],
  },
  document: {
    documentId: 'a71c3f08-52d4-4e96-bb17-0c4e8d2f6a93',
    kind: 'REFERRAL_LETTER',
    title: 'Surat Rujukan — Ibu Rina',
    renderedAt: '2026-08-23T02:15:00.000Z',
  },
  externalDoctorVisit: {
    id: 'd3b8f512-4e07-4a91-b6c3-28d5019e7f4a',
    facilityName: 'RS Ibu dan Anak Melati',
    visitedAt: '2026-04-14',
    isUltrasoundDone: true,
  },
};
