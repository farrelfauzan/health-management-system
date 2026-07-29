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
  eligibilityCheckRequest: {
    force: false,
  },
  referralRequest: {
    destinationProviderCode: '1101R001',
    subSpecialtyCode: '0101',
    saranaCode: '1',
    estimatedReferralDate: '2026-08-10',
    notes: 'Kontrol kardiologi untuk evaluasi lanjutan',
  },
  referral: {
    id: '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
    encounterId: '4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
    destinationProviderCode: '1101R001',
    subSpecialtyCode: '0101',
    saranaCode: '1',
    estimatedReferralDate: '2026-08-10',
    notes: 'Kontrol kardiologi untuk evaluasi lanjutan',
    createdAt: '2026-08-06T03:00:00.000Z',
    updatedAt: '2026-08-06T03:00:00.000Z',
  },
  submission: {
    id: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
    registrationId: '1f2e3d4c-5b6a-7980-a1b2-c3d4e5f6a7b8',
    type: 'PENDAFTARAN',
    status: 'SUBMITTED',
    attempts: 1,
    lastError: null,
    nextAttemptAt: '2026-08-05T02:00:00.000Z',
    lastAttemptAt: '2026-08-05T02:00:05.000Z',
    submittedAt: '2026-08-05T02:00:05.000Z',
    bpjsReferenceNo: 'A12',
    createdAt: '2026-08-05T02:00:00.000Z',
  },
  submissionListMeta: {
    page: 1,
    limit: 10,
    total: 1,
  },
  monthlyReport: {
    month: '2026-08',
    types: [
      { type: 'PENDAFTARAN', recorded: 42, submitted: 40, pending: 0, failed: 2 },
      { type: 'KUNJUNGAN', recorded: 41, submitted: 39, pending: 1, failed: 1 },
      { type: 'PENDAFTARAN_DELETE', recorded: 1, submitted: 1, pending: 0, failed: 0 },
      { type: 'OBAT', recorded: 35, submitted: 34, pending: 0, failed: 1 },
    ],
    failures: [
      {
        submissionId: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
        registrationId: '1f2e3d4c-5b6a-7980-a1b2-c3d4e5f6a7b8',
        type: 'PENDAFTARAN',
        attempts: 1,
        lastError:
          "Doctor dr. Sinta Dewi's specialty has no BPJS poli mapping — map the specialty in BPJS mappings first",
        lastAttemptAt: '2026-08-05T02:30:00.000Z',
      },
    ],
  },
  submissionRetried: {
    id: '8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d',
    registrationId: '1f2e3d4c-5b6a-7980-a1b2-c3d4e5f6a7b8',
    type: 'KUNJUNGAN',
    status: 'SUBMITTED',
    attempts: 1,
    lastError: null,
    nextAttemptAt: '2026-08-05T03:00:00.000Z',
    lastAttemptAt: '2026-08-05T03:00:04.000Z',
    submittedAt: '2026-08-05T03:00:04.000Z',
    bpjsReferenceNo: '0001R0010826K000012',
    createdAt: '2026-08-05T02:10:00.000Z',
  },
  eligibilityActiveResult: {
    state: 'ACTIVE',
    isFromCache: false,
    checkedAt: '2026-08-04T01:30:00.000Z',
    checkedVia: 'BPJS_NUMBER',
    member: {
      name: 'BUDI SANTOSO',
      memberType: 'PEKERJA PENERIMA UPAH',
      memberClass: 'KELAS I',
      providerCode: '01000101',
      providerName: 'KLINIK DEMO',
      isRegisteredHere: true,
      isProlanis: false,
      isPrb: false,
      statusReason: 'AKTIF',
    },
    message: 'BPJS member is active',
  },
  eligibilityUnreachableResult: {
    state: 'UNREACHABLE',
    isFromCache: false,
    checkedAt: '2026-08-04T01:30:00.000Z',
    checkedVia: 'BPJS_NUMBER',
    message:
      'BPJS PCare is unreachable — registration can proceed without the check (BPJS_PCARE_TIMEOUT: BPJS PCare request timed out)',
  },
  medicationMapping: {
    medicationId: '5b4a3c2d-1e0f-9a8b-7c6d-5e4f3a2b1c0d',
    code: 'MED-0001',
    name: 'Paracetamol 500 mg',
    dphoCode: 'K0001',
  },
} as const;
