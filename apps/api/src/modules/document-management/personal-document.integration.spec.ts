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
 * P15-T20 personal knowledge bases, exercised over HTTP with the real
 * controller, the real global `PermissionsGuard`, the real Zod pipe, and the
 * real `PersonalDocumentService`. Prisma is an in-memory table and object
 * storage is a stub, because what these cases prove is the chain above them.
 *
 * The load-bearing cases are the isolation ones. Ownership here is a
 * **predicate of the repository query**, not a check on a loaded row, so the
 * assertions are written against what the route returns for a document
 * somebody else owns — it must be indistinguishable from a document that does
 * not exist. A `403` would confirm the id is real; a `200` would be the
 * cross-user leak the whole ticket exists to prevent.
 *
 * The second group covers the boundary in the other direction: this corpus and
 * the clinic corpus live in one table, and the public channel's retrieval
 * filter keys on `ownerType = CLINIC` + `purpose = FAQ_KNOWLEDGE_BASE`. A
 * caller who could set either field through these routes would be publishing
 * into the corpus patients read, so neither is accepted in a request body and
 * a clinic storage key is refused at confirm.
 */
describe('Personal document integration', () => {
  const TEST_ENV: Record<string, string> = {
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_DOCTOR_USER_ID = '44444444-4444-4444-8444-444444444444';
  const PHARMACIST_USER_ID = '55555555-5555-4555-8555-555555555555';
  const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
  const FOREIGN_DOCUMENT_ID = '66666666-6666-4666-8666-666666666666';
  const DOCTOR_KEY = 'documents/doctor/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';
  const CLINIC_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let documentRows: Array<Record<string, unknown>> = [];
  let chunkRows: Array<Record<string, unknown>> = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(() => DOCTOR_KEY),
    getSignedUploadUrl: jest.fn(() =>
      Promise.resolve({
        url: 'https://storage.test/put',
        key: DOCTOR_KEY,
        expiresAt: '2026-08-05T09:05:00.000Z',
        requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '96256' },
      }),
    ),
    getSignedUrl: jest.fn(() =>
      Promise.resolve({ url: 'https://storage.test/get', expiresAt: '2026-08-05T09:05:00.000Z' }),
    ),
    headObject: jest.fn(() =>
      Promise.resolve({ key: DOCTOR_KEY, sizeBytes: 96256, contentType: 'application/pdf' }),
    ),
  };

  type PrismaMock = {
    document: Record<string, jest.Mock>;
    documentChunk: Record<string, jest.Mock>;
    [key: string]: unknown;
  };

  /**
   * `findFirst` and `findMany` honour `ownerId` exactly as Postgres would.
   * That fidelity is the point: if the mock ignored the column, every
   * isolation case below would pass against a service that had stopped
   * filtering.
   */
  const prismaServiceMock: PrismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((run: (tx: unknown) => unknown): unknown =>
      run(prismaServiceMock as unknown),
    ),
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
          createdAt: new Date('2026-08-05T09:00:00.000Z'),
          updatedAt: new Date('2026-08-05T09:00:00.000Z'),
          deletedAt: null,
          ...data,
        };
        documentRows.push(row);
        return Promise.resolve({ ...row });
      }),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const row = documentRows.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.ownerType === where.ownerType &&
            candidate.ownerId === where.ownerId &&
            candidate.deletedAt === null,
        );
        return Promise.resolve(
          row === undefined ? null : { ...row, _count: { chunks: countChunks(String(row.id)) } },
        );
      }),
      findMany: jest.fn(({ where }: { where?: Record<string, unknown> } = {}) =>
        Promise.resolve(
          documentRows
            .filter(
              (row) =>
                row.deletedAt === null &&
                (where?.ownerType === undefined || row.ownerType === where.ownerType) &&
                (where?.ownerId === undefined || row.ownerId === where.ownerId),
            )
            .map((row) => ({ ...row, _count: { chunks: countChunks(String(row.id)) } })),
        ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = documentRows.find((candidate) => candidate.id === where.id);
          Object.assign(row ?? {}, data);
          return Promise.resolve({ ...(row ?? {}) });
        },
      ),
    },
    documentChunk: {
      deleteMany: jest.fn(({ where }: { where: { documentId: string } }) => {
        const removed = countChunks(where.documentId);
        chunkRows = chunkRows.filter((row) => row.documentId !== where.documentId);
        return Promise.resolve({ count: removed });
      }),
      count: jest.fn(({ where }: { where: { documentId: string } }) =>
        Promise.resolve(countChunks(where.documentId)),
      ),
    },
  };

  function countChunks(documentId: string): number {
    return chunkRows.filter((row) => row.documentId === documentId).length;
  }

  function buildPersonalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: DOCUMENT_ID,
      ownerType: 'DOCTOR',
      ownerId: DOCTOR_USER_ID,
      purpose: 'PERSONAL_KNOWLEDGE_BASE',
      title: 'Panduan Tatalaksana Hipertensi 2026',
      storageKey: DOCTOR_KEY,
      mimeType: 'application/pdf',
      sizeBytes: 96256,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'READY',
      ingestError: null,
      ingestedAt: new Date('2026-08-05T09:02:00.000Z'),
      uploadedById: DOCTOR_USER_ID,
      createdAt: new Date('2026-08-05T09:00:00.000Z'),
      updatedAt: new Date('2026-08-05T09:02:00.000Z'),
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

  /** The two grants `seed.sql` gives DOCTOR — a personal corpus, nothing more. */
  function mockDoctor(userId: string = DOCTOR_USER_ID): void {
    mockActor(userId, 'DOCTOR', [
      { action: 'read', resource: 'Document', scope: 'OWN' },
      { action: 'write', resource: 'Document', scope: 'OWN' },
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
    chunkRows = [];
    jest.clearAllMocks();
  });

  it('signs an upload under the doctor prefix and records it as the caller’s own document', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const signed = await request(app.getHttpServer())
      .post('/api/v1/me/documents/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 96256 })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ storageKey: signed.body.data.storageKey, title: 'Panduan', language: 'ID' })
      .expect(201);

    expect(objectStorageServiceMock.generateObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyPrefix: 'documents/doctor' }),
    );
    expect(created.body.data.ownerType).toBe('DOCTOR');
    expect(created.body.data.ownerId).toBe(DOCTOR_USER_ID);
    expect(created.body.data.purpose).toBe('PERSONAL_KNOWLEDGE_BASE');
    // The storage key is an internal handle; downloads are signed per request.
    expect(created.body.data.storageKey).toBeUndefined();
  });

  it('derives owner and purpose from the caller, ignoring anything the body claims', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: DOCTOR_KEY,
        title: 'Panduan',
        language: 'ID',
        // None of these are in the schema. If any were honoured, this document
        // would land in the corpus the public channel retrieves from.
        ownerType: 'CLINIC',
        ownerId: OTHER_DOCTOR_USER_ID,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'BOTH',
      })
      .expect(201);

    expect(created.body.data.ownerType).toBe('DOCTOR');
    expect(created.body.data.ownerId).toBe(DOCTOR_USER_ID);
    expect(created.body.data.purpose).toBe('PERSONAL_KNOWLEDGE_BASE');
  });

  it('refuses a confirm that names a clinic storage key', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .post('/api/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ storageKey: CLINIC_KEY, title: 'Panduan', language: 'ID' })
      .expect(400);

    expect(documentRows).toHaveLength(0);
  });

  it('lists only the caller’s own documents', async () => {
    documentRows.push(buildPersonalRow());
    documentRows.push(
      buildPersonalRow({
        id: FOREIGN_DOCUMENT_ID,
        ownerId: OTHER_DOCTOR_USER_ID,
        storageKey: 'documents/doctor/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa.pdf',
        title: 'Another doctor’s notes',
      }),
    );
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(DOCUMENT_ID);
  });

  it.each([
    ['read', ''],
    ['download', '/download'],
  ])('reports another doctor’s document as not found on %s', async (_label, suffix) => {
    documentRows.push(buildPersonalRow({ id: FOREIGN_DOCUMENT_ID, ownerId: OTHER_DOCTOR_USER_ID }));
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .get(`/api/v1/me/documents/${FOREIGN_DOCUMENT_ID}${suffix}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('refuses to edit or delete another doctor’s document, and leaves it intact', async () => {
    documentRows.push(buildPersonalRow({ id: FOREIGN_DOCUMENT_ID, ownerId: OTHER_DOCTOR_USER_ID }));
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .patch(`/api/v1/me/documents/${FOREIGN_DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Taken over' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/me/documents/${FOREIGN_DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(documentRows[0]?.title).toBe('Panduan Tatalaksana Hipertensi 2026');
    expect(documentRows[0]?.deletedAt).toBeNull();
  });

  it('does not reach a clinic-corpus document through the personal routes', async () => {
    // Same table, different owner. `document.read:own` must not become a
    // second door onto the corpus the admin routes govern.
    documentRows.push(
      buildPersonalRow({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: 'FAQ_KNOWLEDGE_BASE',
        storageKey: CLINIC_KEY,
      }),
    );
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    await request(app.getHttpServer())
      .get(`/api/v1/me/documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    const listed = await request(app.getHttpServer())
      .get('/api/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listed.body.data).toEqual([]);
  });

  it('refuses a role holding no OWN grant', async () => {
    mockActor(PHARMACIST_USER_ID, 'PHARMACIST', [
      { action: 'read', resource: 'Document', scope: 'ANY' },
      { action: 'write', resource: 'Document', scope: 'ANY' },
    ]);
    const token = await buildToken(PHARMACIST_USER_ID, 'pharmacist@hms.test');

    await request(app.getHttpServer())
      .get('/api/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/documents').expect(401);
  });

  it('deletes the caller’s own document and reports the chunks that went with it', async () => {
    documentRows.push(buildPersonalRow());
    chunkRows.push({ documentId: DOCUMENT_ID }, { documentId: DOCUMENT_ID });
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/me/documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(deleted.body.data.chunksRemoved).toBe(2);
    expect(countChunks(DOCUMENT_ID)).toBe(0);
  });
});
