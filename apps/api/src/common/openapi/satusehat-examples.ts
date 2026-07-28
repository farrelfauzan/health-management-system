/**
 * Canonical examples for the SATUSEHAT linkage endpoints, mirrored by
 * `ApiEndpoint` into the OpenAPI document. Patient IHS numbers are never
 * shown — only their presence — while practitioner IHS numbers are
 * registry-style pseudonymous ids and appear in full.
 */
export const SATUSEHAT_EXAMPLES = {
  patientLink: {
    patientId: 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0',
    hasSatusehatPatientId: true,
    alreadyLinked: false,
  },
  doctorLink: {
    doctorId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    satusehatPractitionerId: 'N10000001',
    alreadyLinked: false,
  },
  submission: {
    id: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
    encounterId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
    status: 'FAILED',
    attempts: 8,
    lastError: 'SATUSEHAT is unreachable (HTTP 503)',
    nextAttemptAt: '2026-07-28T09:00:00.000Z',
    lastAttemptAt: '2026-07-28T08:00:00.000Z',
    submittedAt: null,
    satusehatEncounterId: null,
    createdAt: '2026-07-27T10:15:00.000Z',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
  submissionListMeta: { page: 1, limit: 10, total: 1 },
  submissionRetried: {
    id: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
    encounterId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
    status: 'SUBMITTED',
    attempts: 1,
    lastError: null,
    nextAttemptAt: '2026-07-28T09:05:00.000Z',
    lastAttemptAt: '2026-07-28T09:05:01.000Z',
    submittedAt: '2026-07-28T09:05:01.000Z',
    satusehatEncounterId: 'a1b2c3d4-0000-4000-8000-9f8e7d6c5b4a',
    createdAt: '2026-07-27T10:15:00.000Z',
    updatedAt: '2026-07-28T09:05:01.000Z',
  },
} as const;
