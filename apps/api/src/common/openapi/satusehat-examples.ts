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
} as const;
