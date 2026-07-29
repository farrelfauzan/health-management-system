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
  referenceSyncResult: {
    syncedAt: '2026-08-03T02:00:00.000Z',
    catalogs: [
      { catalog: 'POLI', itemCount: 12 },
      { catalog: 'DOKTER', itemCount: 4 },
      { catalog: 'KESADARAN', itemCount: 5 },
      { catalog: 'TINDAKAN', itemCount: 87 },
      { catalog: 'SPESIALIS', itemCount: 30 },
      { catalog: 'SARANA', itemCount: 8 },
    ],
  },
  referenceStatus: [
    { catalog: 'POLI', itemCount: 12, lastSyncedAt: '2026-08-03T02:00:00.000Z', isSyncable: true },
    { catalog: 'DPHO', itemCount: 41, lastSyncedAt: '2026-08-03T02:10:00.000Z', isSyncable: false },
  ],
  referenceItems: [
    {
      catalog: 'POLI',
      code: '001',
      display: 'POLI UMUM',
      syncedAt: '2026-08-03T02:00:00.000Z',
    },
  ],
  remoteSearchRequest: {
    query: 'paracetamol',
  },
  remoteSearchResult: [
    {
      catalog: 'DPHO',
      code: 'K0001',
      display: 'PARACETAMOL TAB 500 MG',
      syncedAt: '2026-08-03T02:10:00.000Z',
    },
  ],
  mappingOverview: {
    doctors: [
      {
        doctorId: '7c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f',
        fullName: 'dr. Sinta Dewi',
        specialtyName: 'Dokter Umum',
        bpjsDoctorCode: '1234',
      },
    ],
    specialties: [
      {
        specialtyId: '9e8d7c6b-5a4f-3e2d-1c0b-a9f8e7d6c5b4',
        name: 'Dokter Umum',
        bpjsPoliCode: '001',
      },
    ],
  },
  doctorMappingRequest: {
    bpjsDoctorCode: '1234',
  },
  doctorMapping: {
    doctorId: '7c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f',
    fullName: 'dr. Sinta Dewi',
    specialtyName: 'Dokter Umum',
    bpjsDoctorCode: '1234',
  },
  poliMappingRequest: {
    bpjsPoliCode: '001',
  },
  specialtyMapping: {
    specialtyId: '9e8d7c6b-5a4f-3e2d-1c0b-a9f8e7d6c5b4',
    name: 'Dokter Umum',
    bpjsPoliCode: '001',
  },
  dphoMappingRequest: {
    dphoCode: 'K0001',
  },
  medicationMapping: {
    medicationId: '5b4a3c2d-1e0f-9a8b-7c6d-5e4f3a2b1c0d',
    code: 'MED-0001',
    name: 'Paracetamol 500 mg',
    dphoCode: 'K0001',
  },
} as const;
