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
 * P16-T08 patient document API, exercised over HTTP with the real
 * controllers, the real global `PermissionsGuard`, the real Zod pipe, and the
 * real `PatientDocumentService` + `PatientDocumentAccessService`. Prisma is
 * an in-memory table and object storage a stub, as in the sibling suites.
 *
 * The load-bearing cases are the OWN-scope asymmetries (§7.2.4): a doctor who
 * merely attended an encounter may *read* a patient's file but not write it,
 * and a patient reading their own record sees released files only — an
 * unreleased document answers 404, never 403, because "it exists but you may
 * not see it yet" is the disclosure FR-E2-13 defers to the clinician.
 */
describe('Patient document integration', () => {
  const TEST_ENV: Record<string, string> = {
    SATUSEHAT_WORKER_ENABLED: 'false',
    BPJS_WORKER_ENABLED: 'false',
  };
  const previousEnv: Record<string, string | undefined> = {};

  const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';
  const DOCTOR_USER_ID = '22222222-2222-4222-8222-222222222222';
  const PATIENT_USER_ID = '33333333-3333-4333-8333-333333333333';
  const DOCTOR_PROFILE_ID = '44444444-4444-4444-8444-444444444444';
  const PATIENT_ID = '55555555-5555-4555-8555-555555555555';
  const OTHER_PATIENT_ID = '66666666-6666-4666-8666-666666666666';
  const DOCUMENT_ID = '77777777-7777-4777-8777-777777777777';
  const ENCOUNTER_ID = '88888888-8888-4888-8888-888888888888';
  const PATIENT_KEY = 'documents/patient/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';

  const PDF_FIXTURE = Buffer.from('%PDF-1.4\ntrailer << /Root 1 0 R >>\n%%EOF', 'ascii');

  let app: INestApplication;
  let jwtService: JwtService;
  let accessTokenSecret: string;
  let documentRows: Array<Record<string, unknown>> = [];
  let hasAssignment = false;
  let hasAttendedEncounter = false;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(() => PATIENT_KEY),
    getSignedUploadUrl: jest.fn(() =>
      Promise.resolve({
        url: 'https://storage.test/put',
        key: PATIENT_KEY,
        expiresAt: '2026-09-01T09:05:00.000Z',
        requiredHeaders: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(PDF_FIXTURE.byteLength),
        },
      }),
    ),
    getSignedUrl: jest.fn(() =>
      Promise.resolve({ url: 'https://storage.test/get', expiresAt: '2026-09-01T09:10:00.000Z' }),
    ),
    headObject: jest.fn(() =>
      Promise.resolve({
        key: PATIENT_KEY,
        sizeBytes: PDF_FIXTURE.byteLength,
        contentType: 'application/pdf',
      }),
    ),
    getObject: jest.fn(() =>
      Promise.resolve({ key: PATIENT_KEY, body: PDF_FIXTURE, contentType: 'application/pdf' }),
    ),
    uploadObject: jest.fn((uploadRequest: { key: string }) =>
      Promise.resolve({ key: uploadRequest.key }),
    ),
    deleteObject: jest.fn(() => Promise.resolve({ key: PATIENT_KEY, deleted: true })),
  };

  type WhereShape = Record<string, unknown>;

  function matchesDocumentWhere(row: Record<string, unknown>, where: WhereShape): boolean {
    if (where.id !== undefined && row.id !== where.id) {
      return false;
    }
    if (where.purpose !== undefined && row.purpose !== where.purpose) {
      return false;
    }
    if (where.patientId !== undefined && row.patientId !== where.patientId) {
      return false;
    }
    if (where.category !== undefined && row.category !== where.category) {
      return false;
    }
    if (where.encounterId !== undefined && row.encounterId !== where.encounterId) {
      return false;
    }
    if (where.releasedToPatient !== undefined && row.releasedToPatient !== where.releasedToPatient) {
      return false;
    }
    if ('deletedAt' in where && row.deletedAt !== where.deletedAt) {
      return false;
    }
    return true;
  }

  const prismaServiceMock: Record<string, unknown> = {
    featureEntitlement: { findMany: jest.fn(() => Promise.resolve([])) },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((run: (tx: unknown) => unknown): unknown =>
      run(prismaServiceMock as unknown),
    ),
    findFirstActive: jest.fn(
      (
        model: { findFirst: (args: { where: WhereShape }) => unknown },
        args: { where?: WhereShape } = {},
      ) => model.findFirst({ ...args, where: { ...(args.where ?? {}), deletedAt: null } }),
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
          notes: null,
          documentDate: null,
          encounterId: null,
          admissionId: null,
          releasedToPatient: false,
          releasedAt: null,
          releasedById: null,
          deleteReason: null,
          createdAt: new Date('2026-09-01T09:00:00.000Z'),
          updatedAt: new Date('2026-09-01T09:00:00.000Z'),
          deletedAt: null,
          ...data,
        };
        documentRows.push(row);
        return Promise.resolve({ ...row });
      }),
      findFirst: jest.fn(({ where }: { where: WhereShape }) => {
        const row = documentRows.find((candidate) => matchesDocumentWhere(candidate, where));
        return Promise.resolve(row === undefined ? null : { ...row, _count: { chunks: 0 } });
      }),
      findMany: jest.fn(({ where }: { where: WhereShape }) =>
        Promise.resolve(
          documentRows
            .filter((row) => matchesDocumentWhere(row, where ?? {}))
            .map((row) => ({ ...row, _count: { chunks: 0 } })),
        ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = documentRows.find(
            (candidate) => candidate.id === where.id && candidate.deletedAt === null,
          );
          Object.assign(row ?? {}, data);
          return Promise.resolve({ ...(row ?? {}) });
        },
      ),
      updateMany: jest.fn(
        ({ where, data }: { where: WhereShape; data: Record<string, unknown> }) => {
          const matches = documentRows.filter((row) => matchesDocumentWhere(row, where));
          matches.forEach((row) => Object.assign(row, data));
          return Promise.resolve({ count: matches.length });
        },
      ),
    },
    documentChunk: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      count: jest.fn(() => Promise.resolve(0)),
    },
    patientProfile: {
      findFirst: jest.fn(({ where }: { where: WhereShape }) => {
        const patients = [
          { id: PATIENT_ID, ownerUserId: PATIENT_USER_ID },
          { id: OTHER_PATIENT_ID, ownerUserId: null },
        ];
        const row = patients.find(
          (candidate) =>
            (where.id === undefined || candidate.id === where.id) &&
            (where.ownerUserId === undefined || candidate.ownerUserId === where.ownerUserId) &&
            where.id !== undefined !== (where.ownerUserId !== undefined),
        );
        return Promise.resolve(row ?? null);
      }),
    },
    doctorProfile: {
      findFirst: jest.fn(({ where }: { where: WhereShape }) =>
        Promise.resolve(
          where.ownerUserId === DOCTOR_USER_ID ? { id: DOCTOR_PROFILE_ID } : null,
        ),
      ),
    },
    doctorPatient: {
      findFirst: jest.fn(({ where }: { where: WhereShape }) =>
        Promise.resolve(
          hasAssignment && where.doctorId === DOCTOR_PROFILE_ID && where.patientId === PATIENT_ID
            ? { id: 'assignment' }
            : null,
        ),
      ),
    },
    encounter: {
      findFirst: jest.fn(({ where }: { where: WhereShape }) => {
        if (where.id !== undefined) {
          return Promise.resolve(
            where.id === ENCOUNTER_ID &&
              (where.patientId === undefined || where.patientId === PATIENT_ID)
              ? { id: ENCOUNTER_ID, patientId: PATIENT_ID, doctorId: DOCTOR_PROFILE_ID }
              : null,
          );
        }
        return Promise.resolve(
          hasAttendedEncounter &&
            where.doctorId === DOCTOR_PROFILE_ID &&
            where.patientId === PATIENT_ID
            ? { id: ENCOUNTER_ID }
            : null,
        );
      }),
    },
    admission: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
  };

  function buildPatientDocumentRow(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: DOCUMENT_ID,
      ownerType: 'PATIENT',
      ownerId: null,
      purpose: 'PATIENT_CLINICAL',
      title: 'Hasil laboratorium darah lengkap',
      storageKey: PATIENT_KEY,
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      visibility: 'BOTH',
      language: 'ID',
      ingestStatus: 'NOT_APPLICABLE',
      ingestError: null,
      ingestedAt: null,
      uploadedById: ADMIN_USER_ID,
      patientId: PATIENT_ID,
      encounterId: null,
      admissionId: null,
      category: 'LAB_RESULT',
      documentDate: new Date('2026-08-25T00:00:00.000Z'),
      notes: 'Dibawa pasien dari lab eksternal',
      releasedToPatient: false,
      releasedAt: null,
      releasedById: null,
      deleteReason: null,
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      updatedAt: new Date('2026-09-01T09:00:00.000Z'),
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

  /** The three grants `seed.sql` gives ADMIN over patient documents. */
  function mockAdmin(): void {
    mockActor(ADMIN_USER_ID, 'ADMIN', [
      { action: 'read', resource: 'PatientDocument', scope: 'ANY' },
      { action: 'write', resource: 'PatientDocument', scope: 'ANY' },
      { action: 'delete', resource: 'PatientDocument', scope: 'ANY' },
    ]);
  }

  /** The three OWN grants `seed.sql` gives DOCTOR. */
  function mockDoctor(): void {
    mockActor(DOCTOR_USER_ID, 'DOCTOR', [
      { action: 'read', resource: 'PatientDocument', scope: 'OWN' },
      { action: 'write', resource: 'PatientDocument', scope: 'OWN' },
      { action: 'release', resource: 'PatientDocument', scope: 'OWN' },
    ]);
  }

  /** The single read grant `seed.sql` gives PATIENT. */
  function mockPatient(): void {
    mockActor(PATIENT_USER_ID, 'PATIENT', [
      { action: 'read', resource: 'PatientDocument', scope: 'OWN' },
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
    hasAssignment = false;
    hasAttendedEncounter = false;
    jest.clearAllMocks();
  });

  it('signs an upload and records it against the patient, never returning the storage key', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    const uploadUrlResponse = await request(app.getHttpServer())
      .post(`/api/v1/patients/${PATIENT_ID}/documents/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: PDF_FIXTURE.byteLength })
      .expect(200);

    expect(uploadUrlResponse.body.data.storageKey).toBe(PATIENT_KEY);
    expect(documentRows).toHaveLength(0);

    const createResponse = await request(app.getHttpServer())
      .post(`/api/v1/patients/${PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: PATIENT_KEY,
        title: 'Hasil laboratorium darah lengkap',
        category: 'LAB_RESULT',
        documentDate: '2026-08-25',
      })
      .expect(201);

    expect(createResponse.body.data).toMatchObject({
      patientId: PATIENT_ID,
      category: 'LAB_RESULT',
      documentDate: '2026-08-25',
      releasedToPatient: false,
      uploadedById: ADMIN_USER_ID,
    });
    expect(createResponse.body.data).not.toHaveProperty('storageKey');
    expect(createResponse.body.data).not.toHaveProperty('ingestStatus');
    // The row the repository wrote states the invariants itself.
    expect(documentRows[0]).toMatchObject({
      purpose: 'PATIENT_CLINICAL',
      ownerType: 'PATIENT',
      ownerId: null,
      ingestStatus: 'NOT_APPLICABLE',
    });
  });

  it('refuses a confirm that names a key from another surface', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
        title: 'Not a patient document',
        category: 'OTHER',
      })
      .expect(400);

    expect(objectStorageServiceMock.headObject).not.toHaveBeenCalled();
    expect(documentRows).toHaveLength(0);
  });

  it('refuses a confirm linking an encounter that belongs to another patient', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');

    await request(app.getHttpServer())
      .post(`/api/v1/patients/${OTHER_PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        storageKey: PATIENT_KEY,
        title: 'Cross-linked scan',
        category: 'RADIOLOGY',
        encounterId: ENCOUNTER_ID,
      })
      .expect(400);

    expect(documentRows).toHaveLength(0);
  });

  it('lets an assigned doctor write, and a merely-attending doctor read but not write', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');
    const server = app.getHttpServer();
    documentRows.push(buildPatientDocumentRow());

    // Attended an encounter, never assigned: reading the file is clinical
    // necessity (FR-E2-06)…
    hasAttendedEncounter = true;
    await request(server)
      .get(`/api/v1/patients/${PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // …but writing into the permanent record is not (§7.2.4), and there is
    // no break-glass path.
    await request(server)
      .post(`/api/v1/patients/${PATIENT_ID}/documents/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 1024 })
      .expect(403);

    hasAssignment = true;
    await request(server)
      .post(`/api/v1/patients/${PATIENT_ID}/documents/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 1024 })
      .expect(200);
  });

  it('refuses a doctor with neither assignment nor attendance, revealing nothing', async () => {
    mockDoctor();
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');
    documentRows.push(buildPatientDocumentRow());

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/patients/${PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(JSON.stringify(listResponse.body)).not.toContain(DOCUMENT_ID);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/v1/patient-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(JSON.stringify(detailResponse.body)).not.toContain('laboratorium');
  });

  it('shows a patient only released documents, with staff notes withheld', async () => {
    mockPatient();
    const token = await buildToken(PATIENT_USER_ID, 'patient@hms.test');
    const releasedId = '99999999-9999-4999-8999-999999999999';
    documentRows.push(
      buildPatientDocumentRow(),
      buildPatientDocumentRow({
        id: releasedId,
        storageKey: 'documents/patient/aa1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b2.pdf',
        releasedToPatient: true,
        releasedAt: new Date('2026-09-02T10:15:00.000Z'),
        releasedById: DOCTOR_USER_ID,
      }),
    );

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/patients/${PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({ id: releasedId, notes: null });

    // The unreleased document is not found, never forbidden: "it exists but
    // you may not see it yet" is the clinician's disclosure to make.
    await request(app.getHttpServer())
      .get(`/api/v1/patient-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/patient-documents/${releasedId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('releases once, audits the release, and stays idempotent', async () => {
    mockDoctor();
    hasAssignment = true;
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');
    documentRows.push(buildPatientDocumentRow());

    const releaseResponse = await request(app.getHttpServer())
      .post(`/api/v1/patient-documents/${DOCUMENT_ID}/release`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(releaseResponse.body.data).toMatchObject({
      releasedToPatient: true,
      releasedById: DOCTOR_USER_ID,
    });
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATIENT_DOCUMENT_RELEASED',
        resource: 'patient-document',
        actorUserId: DOCTOR_USER_ID,
        resourceId: DOCUMENT_ID,
        patientId: PATIENT_ID,
      }),
    );

    const firstReleasedAt = releaseResponse.body.data.releasedAt;
    auditServiceMock.recordOrThrow.mockClear();

    const repeatResponse = await request(app.getHttpServer())
      .post(`/api/v1/patient-documents/${DOCUMENT_ID}/release`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The first release won the row; a repeat neither rewrites the timestamp
    // nor writes a second release audit row.
    expect(repeatResponse.body.data.releasedAt).toBe(firstReleasedAt);
    expect(auditServiceMock.recordOrThrow).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PATIENT_DOCUMENT_RELEASED' }),
    );
  });

  it('audits a download before returning the signed URL', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    documentRows.push(buildPatientDocumentRow({ encounterId: ENCOUNTER_ID }));

    const response = await request(app.getHttpServer())
      .get(`/api/v1/patient-documents/${DOCUMENT_ID}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(objectStorageServiceMock.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: PATIENT_KEY,
        responseContentType: 'application/pdf',
      }),
    );
    expect(response.body.data).toEqual({
      url: 'https://storage.test/get',
      expiresAt: '2026-09-01T09:10:00.000Z',
    });
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATIENT_DOCUMENT_DOWNLOADED',
        resource: 'patient-document',
        actorUserId: ADMIN_USER_ID,
        resourceId: DOCUMENT_ID,
        patientId: PATIENT_ID,
        metadata: expect.objectContaining({ encounterId: ENCOUNTER_ID }),
      }),
    );
  });

  it('requires a reason to delete, soft-deletes, and audits it', async () => {
    mockAdmin();
    const token = await buildToken(ADMIN_USER_ID, 'admin@hms.test');
    documentRows.push(buildPatientDocumentRow());

    await request(app.getHttpServer())
      .delete(`/api/v1/patient-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/patient-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Filed against wrong patient' })
      .expect(200);

    expect(deleteResponse.body.data).toMatchObject({
      id: DOCUMENT_ID,
      deleteReason: 'Filed against wrong patient',
    });
    // Soft: the row is retired with its reason, the object is not removed.
    expect(documentRows[0]).toMatchObject({ deleteReason: 'Filed against wrong patient' });
    expect(documentRows[0]?.deletedAt).not.toBeNull();
    expect(objectStorageServiceMock.deleteObject).not.toHaveBeenCalled();
    expect(auditServiceMock.recordOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        resource: 'patient-document',
        metadata: expect.objectContaining({ reason: 'Filed against wrong patient' }),
      }),
    );
  });

  it('refuses delete to a doctor, who holds no delete grant', async () => {
    mockDoctor();
    hasAssignment = true;
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');
    documentRows.push(buildPatientDocumentRow());

    await request(app.getHttpServer())
      .delete(`/api/v1/patient-documents/${DOCUMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'should not matter' })
      .expect(403);

    expect(documentRows[0]?.deletedAt).toBeNull();
  });

  it('groups the encounter panel into this visit and history', async () => {
    mockDoctor();
    hasAttendedEncounter = true;
    const token = await buildToken(DOCTOR_USER_ID, 'doctor@hms.test');
    const historyId = '99999999-9999-4999-8999-999999999999';
    documentRows.push(
      buildPatientDocumentRow({ encounterId: ENCOUNTER_ID }),
      buildPatientDocumentRow({
        id: historyId,
        storageKey: 'documents/patient/aa1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b2.pdf',
      }),
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/encounters/${ENCOUNTER_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.thisVisit).toHaveLength(1);
    expect(response.body.data.thisVisit[0].id).toBe(DOCUMENT_ID);
    expect(response.body.data.history).toHaveLength(1);
    expect(response.body.data.history[0].id).toBe(historyId);
  });

  it('lists released documents in the portal with the narrow view', async () => {
    mockPatient();
    const token = await buildToken(PATIENT_USER_ID, 'patient@hms.test');
    documentRows.push(
      buildPatientDocumentRow(),
      buildPatientDocumentRow({
        id: '99999999-9999-4999-8999-999999999999',
        storageKey: 'documents/patient/aa1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b2.pdf',
        releasedToPatient: true,
        releasedAt: new Date('2026-09-02T10:15:00.000Z'),
        releasedById: DOCTOR_USER_ID,
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/portal/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    // The portal view is deliberately narrow: no staff notes, no internal
    // user ids, no episode links.
    expect(response.body.data[0]).not.toHaveProperty('notes');
    expect(response.body.data[0]).not.toHaveProperty('uploadedById');
    expect(response.body.data[0]).not.toHaveProperty('releasedById');
    expect(response.body.data[0]).toMatchObject({ category: 'LAB_RESULT' });
  });

  it('refuses an actor with no patient-document grant at the guard', async () => {
    mockActor(DOCTOR_USER_ID, 'PHARMACIST', [
      { action: 'read', resource: 'Medication', scope: 'ANY' },
    ]);
    const token = await buildToken(DOCTOR_USER_ID, 'pharmacist@hms.test');

    await request(app.getHttpServer())
      .get(`/api/v1/patients/${PATIENT_ID}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
