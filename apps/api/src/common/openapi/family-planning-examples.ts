/**
 * Response examples for the family planning course (P25-T14). The story is
 * the ticket's: Ibu Dewi starts a 3-month injectable on 1 October 2026 as a
 * new acceptor, and the sourced 84-day default puts her next injection on
 * 24 December.
 */
const COURSE_ID = '5d2c8e41-7b93-4a06-9f15-c3e8a2b7d104';
const PATIENT_ID = '4a9b2c71-8e35-4d02-a6f7-3b0c9d18e5a4';
const PROVIDER_ID = '8f3a6d12-4c57-4e89-b0a1-2d7e9c5f3b68';

const COURSE = {
  id: COURSE_ID,
  patientId: PATIENT_ID,
  method: 'INJECTABLE_3_MONTH',
  acceptorType: 'NEW',
  startedOn: '2026-10-01',
  providerDoctorId: PROVIDER_ID,
  providerName: 'Bidan Sari',
  startEncounterId: null,
  deliveryRecordId: null,
  mandateId: null,
  nextDueOn: '2026-12-24',
  sideEffects: null,
  discontinuedOn: null,
  discontinuationReason: null,
  isLive: true,
  services: [],
};

export const FAMILY_PLANNING_EXAMPLES = {
  course: COURSE,
  patientFamilyPlanning: {
    liveCourse: COURSE,
    courses: [COURSE],
    postDeliveryCandidate: null,
  },
  startRequest: {
    method: 'INJECTABLE_3_MONTH',
    acceptorType: 'NEW',
    startedOn: '2026-10-01',
    providerDoctorId: PROVIDER_ID,
  },
  serviceRequest: {
    servedOn: '2026-12-23',
    action: 'Suntik DMPA ulang',
  },
  serviceCourse: {
    ...COURSE,
    nextDueOn: '2027-03-17',
    services: [
      {
        id: '0b7e3f95-2a18-4c6d-8e41-9f5a1c3d7b20',
        encounterId: null,
        servedOn: '2026-12-23',
        action: 'Suntik DMPA ulang',
        nextDueOn: '2027-03-17',
      },
    ],
  },
  discontinueRequest: {
    discontinuedOn: '2027-03-17',
    reason: 'WANTS_PREGNANCY',
  },
  dueItem: {
    familyPlanningRecordId: COURSE_ID,
    patientId: PATIENT_ID,
    patientName: 'Dewi Lestari',
    medicalRecordNumber: 'RM-000123',
    method: 'INJECTABLE_3_MONTH',
    nextDueOn: '2026-12-24',
    daysUntilDue: 7,
  },
};
