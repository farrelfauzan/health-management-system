import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * `P16-T17` over HTTP with the real controller, the real global
 * `PermissionsGuard`, the real Zod pipe and the real `VaultDocumentService`.
 * Prisma is an in-memory table and object storage is a stub, because what
 * these cases prove is the chain above them.
 *
 * The load-bearing group is isolation, and it is asserted for **ADMIN as well
 * as DOCTOR** (US-E3-02). An administrator holds `:any` keys over most of this
 * product; the claim under test is that none of them reaches a vault, because
 * no such key exists and no route accepts an owner. A `403` here would be a
 * failure too, not just a `200`: distinguishing "forbidden" from "not found"
 * would confirm that a given document id is real.
 *
 * The second group is the boundary with the personal knowledge base. The two
 * live in one table, and a knowledge-base document's passages are sent to the
 * AI provider while a vault document's are not — so a confirm naming a
 * knowledge-base storage key is refused here, and vice versa on that surface.
 */
describe('Vault document integration', () => {
  const TEST_ENV: Record<string, string> = {
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_DOCTOR_USER_ID = '44444444-4444-4444-8444-444444444444';
  const ADMIN_USER_ID = '77777777-7777-4777-8777-777777777777';
  const PHARMACIST_USER_ID = '55555555-5555-4555-8555-555555555555';
  const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
  const FOREIGN_DOCUMENT_ID = '66666666-6666-4666-8666-666666666666';
  const VAULT_KEY = 'documents/vault/doctor/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';
  const KNOWLEDGE_BASE_KEY = 'documents/doctor/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';
  const CLINIC_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let documentRows: Array<Record<string, unknown>> = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(() => VAULT_KEY),
    getSignedUploadUrl: jest.fn(() =>
      Promise.resolve({
        url: 'https://storage.test/put',
        key: VAULT_KEY,
        expiresAt: '2026-09-03T09:05:00.000Z',
        requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '148480' },
      }),
    ),
    getSignedUrl: jest.fn(() =>
      Promise.resolve({ url: 'https://storage.test/get', expiresAt: '2026-09-03T09:05:00.000Z' }),
    ),
    headObject: jest.fn(() =>
      Promise.resolve({ key: VAULT_KEY, sizeBytes: 148480, contentType: 'application/pdf' }),
    ),
    // The confirm-time content gate (SJ-21) reads the bytes back; these are
    // PDF-shaped so a confirm against this mock passes the magic-byte check.
    getObject: jest.fn(() =>
      Promise.resolve({
        key: VAULT_KEY,
        body: Buffer.from('%PDF-1.4\ntrailer << /Root 1 0 R >>\n%%EOF', 'ascii'),
        contentType: 'application/pdf',
      }),
    ),
    deleteObject: jest.fn(() => Promise.resolve({ key: VAULT_KEY, deleted: true })),
  };

  type PrismaMock = {
    document: Record<string, jest.Mock>;
    [key: string]: unknown;
  };

  /**
   * `findFirst`, `findMany`, `updateMany` and `delete` honour `ownerId` and
   * `purpose` exactly as Postgres would. That fidelity is the point: a mock
   * that ignored either column would let every isolation case below pass
   * against a service that had stopped filtering.
   */
  const prismaServiceMock: PrismaMock = {
    // IMP-8: `FeatureGuard` resolves this controller's entitlement through
    // Prisma on every request, and this stub replaces Prisma wholesale.
    featureEntitlement: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((run: (tx: unknown) => unknown): unknown =>
      run(prismaServiceMock as unknown),
    ),
    vaultDocumentExpiryNotice: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      createMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    document: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (documentRows.some((row) => row.storageKey === data.storageKey)) {
          return Promise.reject(
            Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
          );
        }
        const row = {
          id: DOCUMENT_ID,
          ingestError: null,
          ingestedAt: null,
          patientId: null,
          encounterId: null,
          admissionId: null,
          category: null,
          documentDate: null,
          notes: null,
          releasedToPatient: false,
          releasedAt: null,
          releasedById: null,
          deleteReason: null,
          vaultCategory: null,
          referenceNumber: null,
          issuedAt: null,
          expiresAt: null,
          createdAt: new Date('2026-09-03T09:00:00.000Z'),
          updatedAt: new Date('2026-09-03T09:00:00.000Z'),
          deletedAt: null,
          // Prisma writes the column default for a field the payload omits; it
          // does not store `undefined`. Spreading `data` raw would put
          // `undefined` over the nulls above and make this stub disagree with
          // Postgres about what an unset optional reads back as.
          ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
        };
        documentRows.push(row);
        return Promise.resolve({ ...row });
      }),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const row = matchRows(where)[0];
        return Promise.resolve(row === undefined ? null : { ...row });
      }),
      findMany: jest.fn(({ where }: { where?: Record<string, unknown> } = {}) =>
        Promise.resolve(matchRows(where ?? {}).map((row) => ({ ...row }))),
      ),
      updateMany: jest.fn(
        ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const rows = matchRows(where);
          for (const row of rows) {
            Object.assign(row, data);
          }
          return Promise.resolve({ count: rows.length });
        },
      ),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const index = documentRows.findIndex((row) => row.id === where.id);
        const [removed] = documentRows.splice(index, 1);
        return Promise.resolve({ ...(removed ?? {}) });
      }),
    },
  };

  function matchRows(where: Record<string, unknown>): Array<Record<string, unknown>> {
    return documentRows.filter(
      (row) =>
        row.deletedAt === null &&
        (where.id === undefined || row.id === where.id) &&
        (where.ownerId === undefined || row.ownerId === where.ownerId) &&
        (where.purpose === undefined || row.purpose === where.purpose) &&
        (where.vaultCategory === undefined || row.vaultCategory === where.vaultCategory),
    );
  }

  function buildVaultRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: DOCUMENT_ID,
      ownerType: 'DOCTOR',
      ownerId: DOCTOR_USER_ID,
      purpose: 'DOCTOR_VAULT',
      title: 'STR Dokter Umum',
      storageKey: VAULT_KEY,
      mimeType: 'application/pdf',
      sizeBytes: 148480,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'NOT_APPLICABLE',
      ingestError: null,
      ingestedAt: null,
      uploadedById: DOCTOR_USER_ID,
      patientId: null,
      encounterId: null,
      admissionId: null,
      category: null,
      documentDate: null,
      notes: null,
      releasedToPatient: false,
      releasedAt: null,
      releasedById: null,
      deleteReason: null,
      vaultCategory: 'REGISTRATION_LICENCE',
      referenceNumber: 'STR-EXAMPLE-0000',
      issuedAt: new Date('2024-03-14T00:00:00.000Z'),
      expiresAt: new Date('2029-03-14T00:00:00.000Z'),
      createdAt: new Date('2026-09-03T09:00:00.000Z'),
      updatedAt: new Date('2026-09-03T09:00:00.000Z'),
      deletedAt: null,
      ...overrides,
    };
  }

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: accessTokenSecret });
  }

  function mockActor(
    userId: string,
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: userId,
      roles: [
        {
          role: { code: roleCode, permissions: permissions.map((permission) => ({ permission })) },
        },
      ],
    });
  }

  /**
   * The grants `seed.sql` gives DOCTOR over a vault — their own, nothing
   * more. `delete` is its own key since P16-T41, split out of `write` so an
   * offboarded person can be granted "take a copy, then delete" alone.
   */
  function mockDoctor(userId: string = DOCTOR_USER_ID): void {
    mockActor(userId, 'DOCTOR', [
      { action: 'read', resource: 'VaultDocument', scope: 'OWN' },
      { action: 'write', resource: 'VaultDocument', scope: 'OWN' },
      { action: 'delete', resource: 'VaultDocument', scope: 'OWN' },
    ]);
  }

  /**
   * An administrator with the vault grants **and** every `:any` key this
   * product defines over documents. The point of the cases using it is that
   * the second group buys them nothing here.
   */
  function mockAdmin(): void {
    mockActor(ADMIN_USER_ID, 'ADMIN', [
      { action: 'read', resource: 'VaultDocument', scope: 'OWN' },
      { action: 'write', resource: 'VaultDocument', scope: 'OWN' },
      { action: 'delete', resource: 'VaultDocument', scope: 'OWN' },
      { action: 'read', resource: 'Document', scope: 'ANY' },
      { action: 'write', resource: 'Document', scope: 'ANY' },
      { action: 'read', resource: 'PatientDocument', scope: 'ANY' },
      { action: 'write', resource: 'PatientDocument', scope: 'ANY' },
      { action: 'delete', resource: 'PatientDocument', scope: 'ANY' },
    ]);
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    accessTokenSecret =
      moduleRef.get(ConfigService).get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret';
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    documentRows = [];
    jest.clearAllMocks();
  });

  it('signs an upload under the vault prefix and records it as the caller’s own document', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const signed = await request(app.getHttpServer())
      .post('/api/v1/me/vault-documents/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 148480 })
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: signed.body.data.storageKey,
        title: 'STR Dokter Umum',
        language: 'ID',
        vaultCategory: 'REGISTRATION_LICENCE',
        referenceNumber: 'STR-EXAMPLE-0000',
        issuedAt: '2024-03-14',
        expiresAt: '2029-03-14',
      })
      .expect(201);

    expect(signed.body.data.storageKey).toBe(VAULT_KEY);
    expect(created.body.data).toMatchObject({
      title: 'STR Dokter Umum',
      vaultCategory: 'REGISTRATION_LICENCE',
      issuedAt: '2024-03-14',
      expiresAt: '2029-03-14',
    });
    // Never ingested, and the row says so rather than the pipeline being
    // trusted to skip it (FR-E3-05).
    expect(documentRows[0]).toMatchObject({
      purpose: 'DOCTOR_VAULT',
      ingestStatus: 'NOT_APPLICABLE',
      ownerId: DOCTOR_USER_ID,
    });
  });

  it('never returns the owner id or the storage key in a vault response', async () => {
    mockDoctor();
    documentRows.push(buildVaultRow());
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/me/vault-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // This surface addresses exactly one vault, so echoing whose it is would
    // answer a question the API never lets anyone ask.
    expect(response.body.data.ownerId).toBeUndefined();
    expect(response.body.data.storageKey).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(DOCTOR_USER_ID);
  });

  it('lists only the caller’s own documents', async () => {
    mockDoctor();
    documentRows.push(
      buildVaultRow(),
      buildVaultRow({ id: FOREIGN_DOCUMENT_ID, ownerId: OTHER_DOCTOR_USER_ID }),
    );
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([DOCUMENT_ID]);
  });

  it('reports a document owned by someone else as not found, for a doctor', async () => {
    mockDoctor();
    documentRows.push(buildVaultRow({ id: FOREIGN_DOCUMENT_ID, ownerId: OTHER_DOCTOR_USER_ID }));
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/me/vault-documents/${FOREIGN_DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    // 404 rather than 403, and a body that says nothing: a "forbidden" here
    // would confirm the id is real.
    expect(JSON.stringify(response.body)).not.toContain(OTHER_DOCTOR_USER_ID);
    expect(response.body.error.message).toBe('Document not found');
  });

  it('reports a document owned by someone else as not found, for an ADMIN holding every ANY key', async () => {
    // US-E3-02. The administrator below holds `read:any` and `write:any` over
    // documents and patient documents; none of it reaches a vault, because the
    // catalog defines no vault permission above OWN and no route accepts an
    // owner to widen to.
    mockAdmin();
    documentRows.push(buildVaultRow({ id: FOREIGN_DOCUMENT_ID, ownerId: OTHER_DOCTOR_USER_ID }));
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    await request(app.getHttpServer())
      .get(`/api/v1/me/vault-documents/${FOREIGN_DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('answers an ADMIN’s vault list with their own vault, which is empty', async () => {
    mockAdmin();
    documentRows.push(buildVaultRow(), buildVaultRow({ id: FOREIGN_DOCUMENT_ID }));
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('refuses to update or delete a document owned by someone else', async () => {
    mockDoctor();
    documentRows.push(buildVaultRow({ id: FOREIGN_DOCUMENT_ID, ownerId: OTHER_DOCTOR_USER_ID }));
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .patch(`/api/v1/me/vault-documents/${FOREIGN_DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'renamed by a stranger' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/me/vault-documents/${FOREIGN_DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(documentRows[0]?.title).toBe('STR Dokter Umum');
  });

  it('ignores an owner id smuggled into a confirm body', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .post('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: VAULT_KEY,
        title: 'Smuggled',
        language: 'ID',
        ownerId: OTHER_DOCTOR_USER_ID,
        ownerType: 'ADMIN',
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
      })
      .expect(201);

    // The schema does not accept these fields, so they are stripped rather
    // than honoured — the row is the caller's, in their vault.
    expect(documentRows[0]).toMatchObject({
      ownerId: DOCTOR_USER_ID,
      ownerType: 'DOCTOR',
      purpose: 'DOCTOR_VAULT',
    });
  });

  it('hard-deletes: the row is gone and the stored object goes with it', async () => {
    mockDoctor();
    documentRows.push(buildVaultRow());
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .delete(`/api/v1/me/vault-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({ id: DOCUMENT_ID, deleted: true });
    expect(documentRows).toEqual([]);
    expect(objectStorageServiceMock.deleteObject).toHaveBeenCalledWith({ key: VAULT_KEY });
  });

  it('refuses a confirm naming a personal knowledge-base storage key', async () => {
    // The mistake this check exists for: `documents/doctor/…` and
    // `documents/vault/doctor/…` are one path segment apart, and a
    // knowledge-base object confirmed into the vault — or the reverse, which
    // would send a KTP to an embedding provider — must be impossible.
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ storageKey: KNOWLEDGE_BASE_KEY, title: 'Misfiled', language: 'ID' })
      .expect(400);

    expect(response.body.error.message).toBe(
      'Storage key was not issued for an upload to your vault',
    );
    expect(documentRows).toEqual([]);
  });

  it('refuses a confirm naming a clinic-corpus storage key', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .post('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ storageKey: CLINIC_KEY, title: 'Misfiled', language: 'ID' })
      .expect(400);

    expect(documentRows).toEqual([]);
  });

  it('refuses an expiry that precedes the issue date with a readable 400', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: VAULT_KEY,
        title: 'Backwards',
        language: 'ID',
        issuedAt: '2027-01-01',
        expiresAt: '2026-01-01',
      })
      .expect(400);

    expect(response.body.error.message).toBe('Expiry date cannot precede the issue date');
  });

  it('audits a download before returning the URL', async () => {
    mockDoctor();
    documentRows.push(buildVaultRow());
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .get(`/api/v1/me/vault-documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VAULT_DOCUMENT_DOWNLOADED',
        actorUserId: DOCTOR_USER_ID,
        resourceId: DOCUMENT_ID,
      }),
    );
  });

  it('refuses a role holding no vault grant', async () => {
    // A pharmacist has no vault in this phase. The seed gives them no key, so
    // the OWN-scope check in the service refuses before any row is read.
    mockActor(PHARMACIST_USER_ID, 'PHARMACIST', [
      { action: 'read', resource: 'Document', scope: 'OWN' },
    ]);
    const token = await buildToken(PHARMACIST_USER_ID, 'pharmacist@hms.test');

    await request(app.getHttpServer())
      .get('/api/v1/me/vault-documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
