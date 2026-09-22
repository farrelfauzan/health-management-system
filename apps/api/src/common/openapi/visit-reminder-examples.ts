/**
 * Canonical examples for visit-reminder consent and the maternal due
 * worklist (P25-T17), mirrored by `ApiEndpoint` into the OpenAPI document.
 */
const PATIENT_ID = '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c';

const GRANTED_CONSENT = {
  purpose: 'VISIT_REMINDER',
  isGranted: true,
  noticeVersion: { id: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9', version: '1.0' },
  grantedAt: '2026-09-28T02:15:00.000Z',
  grantedBy: {
    id: '0f4b6f2a-5d7e-4c1b-9a3e-2b8c7d6e5f40',
    email: 'bidan@klinik.example',
    name: 'Bidan Sari',
  },
  revokedAt: null,
  revokedReason: null,
};

const DUE_ITEM = {
  visitKey: 'PNC:5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b:KF2',
  source: 'POSTNATAL',
  code: 'KF2',
  subject: 'PATIENT',
  patientId: PATIENT_ID,
  patientName: 'Rina Wati',
  medicalRecordNumber: 'RM-000123',
  dueFrom: '2026-10-02',
  dueUntil: '2026-10-06',
  hasReminderConsent: true,
  reminder: { status: 'SENT', attemptedAt: '2026-10-01T02:00:04.000Z' },
};

export const VISIT_REMINDER_EXAMPLES = {
  consent: { patientId: PATIENT_ID, consent: GRANTED_CONSENT },
  upsertRequest: { isGranted: true },
  due: { from: '2026-10-01', to: '2026-10-07', items: [DUE_ITEM] },
} as const;
