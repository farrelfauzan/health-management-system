/**
 * Canonical examples for the BPJS Antrean Online configuration endpoints,
 * mirrored by `ApiEndpoint` into the OpenAPI document. Secrets are write-only:
 * request examples carry them, response examples only ever show presence
 * flags and last-4 display values. All values are synthetic.
 */
export const BPJS_ANTREAN_EXAMPLES = {
  configView: {
    id: '7c6b5a49-3821-4d0e-9f8a-1b2c3d4e5f60',
    environment: 'DEVELOPMENT',
    consId: '20250042',
    kdProviderPpk: '01000101',
    hasSecretKey: true,
    secretKeyLast4: 'nKey',
    hasUserKey: true,
    userKeyLast4: '4c5d',
    inboundUsername: 'bpjs-antrean-ws',
    hasInboundPassword: true,
    isActive: true,
    lastTestedAt: '2026-08-14T03:15:00.000Z',
    lastTestResult: 'OK: Signature accepted and response decrypted (HFIS poli reference read)',
    createdAt: '2026-08-14T09:00:00.000Z',
    updatedAt: '2026-08-14T03:15:00.000Z',
  },
  upsertRequest: {
    environment: 'DEVELOPMENT',
    consId: '20250042',
    kdProviderPpk: '01000101',
    secretKey: 'sample-antrean-secret-key',
    userKey: 'sample-antrean-user-key',
    inboundUsername: 'bpjs-antrean-ws',
    inboundPassword: 'sample-inbound-password',
    isActive: true,
  },
  connectionTestResult: {
    isSuccessful: true,
    message: 'Signature accepted and response decrypted (HFIS poli reference read)',
    testedAt: '2026-08-14T03:15:00.000Z',
  },
  deletedConfig: {
    id: '7c6b5a49-3821-4d0e-9f8a-1b2c3d4e5f60',
  },
} as const;
