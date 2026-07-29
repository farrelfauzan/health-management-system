/**
 * Canonical examples for the BPJS PCare configuration endpoints, mirrored by
 * `ApiEndpoint` into the OpenAPI document. Secrets are write-only: request
 * examples carry them, response examples only ever show presence flags and
 * last-4 display values. All values are synthetic.
 */
export const BPJS_PCARE_EXAMPLES = {
  configView: {
    id: '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9',
    environment: 'DEVELOPMENT',
    consId: '20250001',
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    hasSecretKey: true,
    secretKeyLast4: 'tKey',
    hasUserKey: true,
    userKeyLast4: '8f90',
    hasPcarePassword: true,
    isActive: true,
    lastTestedAt: '2026-08-02T03:15:00.000Z',
    lastTestResult: 'OK: Signature accepted and response decrypted (poli reference read)',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-02T03:15:00.000Z',
  },
  upsertRequest: {
    environment: 'DEVELOPMENT',
    consId: '20250001',
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    secretKey: 'sample-secret-key',
    userKey: 'sample-user-key',
    pcarePassword: 'sample-password',
    isActive: true,
  },
  connectionTestResult: {
    isSuccessful: true,
    message: 'Signature accepted and response decrypted (poli reference read)',
    testedAt: '2026-08-02T03:15:00.000Z',
  },
  deletedConfig: {
    id: '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9',
  },
} as const;
