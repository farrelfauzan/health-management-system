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
 * P15-T10 admin document API, exercised over HTTP with the real controller,
 * the real global `PermissionsGuard`, the real Zod pipe, and the real
 * `DocumentService`. Prisma is an in-memory table and object storage is a
 * stub, because what these cases prove is the chain above them.
 *
 * The load-bearing case is the doctor one. The guard cannot distinguish an
 * `ANY` grant from an `OWN` one — a CASL rule with an ownership condition
 * still answers "can write Document" for the subject type — so a green
 * `403` there is the only evidence that a clinician holding
 * `document.write:own` for their own knowledge base cannot reach the shared
 * clinic corpus through these routes.
 */
describe('Document management integration', () => {
  const TEST_ENV: Record<string, string> = {
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
  const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
  const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
  const CLINIC_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let documentRows: Array<Record<string, unknown>> = [];
  let chunkRows: Array<Record<string, unknown>> = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(() => CLINIC_KEY),
    getSignedUploadUrl: jest.fn(() =>
      Promise.resolve({
        url: 'https://storage.test/put',
        key: CLINIC_KEY,
        expiresAt: '2026-08-03T09:05:00.000Z',
        requiredHeaders: { 'Content-Type': 'application/pdf', 'Content-Length': '184320' },
      }),
    ),
    getSignedUrl: jest.fn(() =>
      Promise.resolve({ url: 'https://storage.test/get', expiresAt: '2026-08-03T09:05:00.000Z' }),
    ),
    headObject: jest.fn(() =>
      Promise.resolve({ key: CLINIC_KEY, sizeBytes: 184320, contentType: 'application/pdf' }),
    ),
  };

  type PrismaMock = {
    document: Record<string, jest.Mock>;
    documentChunk: Record<string, jest.Mock>;
    [key: string]: unknown;
  };

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
          createdAt: new Date('2026-08-03T09:00:00.000Z'),
          updatedAt: new Date('2026-08-03T09:00:00.000Z'),
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
            candidate.deletedAt === null,
        );
        return Promise.resolve(
          row === undefined ? null : { ...row, _count: { chunks: countChunks(String(row.id)) } },
        );
      }),
      findMany: jest.fn(() =>
        Promise.resolve(
          documentRows
            .filter((row) => row.deletedAt === null)
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

  function buildStoredDocumentRow(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: DOCUMENT_ID,
      ownerType: 'CLINIC',
      ownerId: null,
      purpose: 'FAQ_KNOWLEDGE_BASE',
      title: 'Internal Escalation Protocol',
      storageKey: CLINIC_KEY,
      mimeType: 'text/markdown',
      sizeBytes: 4096,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'READY',
      ingestError: null,
      ingestedAt: new Date('2026-08-03T09:02:00.000Z'),
      uploadedById: ADMIN_USER_ID,
      createdAt: new Date('2026-08-02T11:00:00.000Z'),
      updatedAt: new Date('2026-08-03T09:02:00.000Z'),
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

  /** The four grants `seed.sql` gives ADMIN over the document store. */
  function mockAdmin(): void {
    mockActor(ADMIN_USER_ID, 'ADMIN', [
      { action: 'read', resource: 'Document', scope: 'ANY' },
      { action: 'write', resource: 'Document', scope: 'ANY' },
      { action: 'read', resource: 'Document', scope: 'OWN' },
      { action: 'write', resource: 'Document', scope: 'OWN' },
    ]);
  }

  /** The two grants `seed.sql` gives DOCTOR — a personal corpus, nothing more. */
  function mockDoctor(): void {
    mockActor(DOCTOR_USER_ID, 'DOCTOR', [
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

  it('signs an upload, records it from the stored object, and never returns the storage key', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    const uploadUrlResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/documents/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 184320 })
      .expect(200);

    expect(uploadUrlResponse.body.data.storageKey).toBe(CLINIC_KEY);
    // Nothing is persisted by signing: a URL nobody uses leaves no row.
    expect(documentRows).toHaveLength(0);

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: CLINIC_KEY,
        title: 'SOP Alur Pendaftaran',
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'BOTH',
        language: 'ID',
      })
      .expect(201);

    expect(createResponse.body.data).toMatchObject({
      ownerType: 'CLINIC',
      ownerId: null,
      mimeType: 'application/pdf',
      sizeBytes: 184320,
      ingestStatus: 'PENDING',
      chunkCount: 0,
      uploadedById: ADMIN_USER_ID,
    });
    expect(createResponse.body.data).not.toHaveProperty('storageKey');
  });

  it('refuses a confirm that names an object this module never minted', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    await request(app.getHttpServer())
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: 'patients/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.jpg',
        title: 'Not a clinic document',
        purpose: 'FAQ_KNOWLEDGE_BASE',
        visibility: 'BOTH',
        language: 'ID',
      })
      .expect(400);

    expect(objectStorageServiceMock.headObject).not.toHaveBeenCalled();
    expect(documentRows).toHaveLength(0);
  });

  it('refuses a replayed confirm instead of attaching a second document to one file', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    const body = {
      storageKey: CLINIC_KEY,
      title: 'SOP Alur Pendaftaran',
      purpose: 'FAQ_KNOWLEDGE_BASE',
      visibility: 'BOTH',
      language: 'ID',
    };

    await request(app.getHttpServer())
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(409);

    expect(documentRows).toHaveLength(1);
  });

  it('discards the chunks when a document is demoted out of patient visibility', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    documentRows.push({
      id: DOCUMENT_ID,
      ownerType: 'CLINIC',
      ownerId: null,
      purpose: 'FAQ_KNOWLEDGE_BASE',
      title: 'Internal Escalation Protocol',
      storageKey: CLINIC_KEY,
      mimeType: 'text/markdown',
      sizeBytes: 4096,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'READY',
      ingestError: null,
      ingestedAt: new Date('2026-08-03T09:02:00.000Z'),
      uploadedById: ADMIN_USER_ID,
      createdAt: new Date('2026-08-02T11:00:00.000Z'),
      updatedAt: new Date('2026-08-03T09:02:00.000Z'),
      deletedAt: null,
    });
    chunkRows.push({ documentId: DOCUMENT_ID }, { documentId: DOCUMENT_ID });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visibility: 'DOCTOR' })
      .expect(200);

    // The chunks carried `visibility: BOTH`. Had they survived, this SOP
    // would keep answering patient questions until someone re-ingested it.
    expect(chunkRows).toHaveLength(0);
    expect(response.body.data).toMatchObject({
      visibility: 'DOCTOR',
      ingestStatus: 'PENDING',
      chunkCount: 0,
    });
  });

  it('refuses a doctor holding only the OWN grants on every clinic-corpus route', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');
    const server = app.getHttpServer();

    await request(server)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(server)
      .post('/api/v1/admin/documents/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 1024 })
      .expect(403);
    await request(server)
      .get(`/api/v1/admin/documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(server)
      .get(`/api/v1/admin/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(server)
      .patch(`/api/v1/admin/documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed' })
      .expect(403);
    await request(server)
      .post(`/api/v1/admin/documents/${DOCUMENT_ID}/ingest`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await request(server)
      .delete(`/api/v1/admin/documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(objectStorageServiceMock.getSignedUploadUrl).not.toHaveBeenCalled();
    expect(objectStorageServiceMock.getSignedUrl).not.toHaveBeenCalled();
  });

  it('queues a re-ingest rather than embedding inline, keeping the old chunks answering', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    documentRows.push(buildStoredDocumentRow({ ingestStatus: 'READY', ingestError: 'stale' }));
    chunkRows.push({ documentId: DOCUMENT_ID }, { documentId: DOCUMENT_ID });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/documents/${DOCUMENT_ID}/ingest`)
      .set('Authorization', `Bearer ${token}`)
      .expect(202);

    expect(response.body.data).toMatchObject({ ingestStatus: 'PENDING', ingestError: null });
    // Unlike a visibility change, a re-ingest of a working document must not
    // make it temporarily unanswerable — the new set replaces the old in one
    // transaction when the worker gets to it.
    expect(chunkRows).toHaveLength(2);
  });

  it('refuses to queue a document that is stored but never embedded', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    documentRows.push(
      buildStoredDocumentRow({ purpose: 'GENERAL', ingestStatus: 'NOT_APPLICABLE' }),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/admin/documents/${DOCUMENT_ID}/ingest`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('refuses an actor with no document grant at the guard', async () => {
    mockActor(DOCTOR_USER_ID, 'PHARMACIST', [
      { action: 'read', resource: 'Medication', scope: 'ANY' },
    ]);
    const token = await buildToken(DOCTOR_USER_ID, 'pharmacist@hms.test');

    await request(app.getHttpServer())
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('mints a download URL per request and never persists it', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    documentRows.push({
      id: DOCUMENT_ID,
      ownerType: 'CLINIC',
      ownerId: null,
      purpose: 'GENERAL',
      title: 'Price list',
      storageKey: CLINIC_KEY,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'NOT_APPLICABLE',
      ingestError: null,
      ingestedAt: null,
      uploadedById: ADMIN_USER_ID,
      createdAt: new Date('2026-08-02T11:00:00.000Z'),
      updatedAt: new Date('2026-08-02T11:00:00.000Z'),
      deletedAt: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(objectStorageServiceMock.getSignedUrl).toHaveBeenCalledWith({ key: CLINIC_KEY });
    expect(response.body.data).toEqual({
      url: 'https://storage.test/get',
      expiresAt: '2026-08-03T09:05:00.000Z',
    });
  });
});
