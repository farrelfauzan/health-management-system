import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditRepository } from '../../common/audit/audit.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DoctorAuthorityRepository } from './repository/doctor-authority.repository';
import { DoctorMandateRepository } from './repository/doctor-mandate.repository';

/**
 * P25-T05. The route surface of a doctor's written pelimpahan, with the
 * repositories, the audit writer and object storage stubbed at their seams.
 */
describe('DoctorMandate integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const midwifeDoctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const mandatingDoctorId = 'c2a4e1d0-3f5b-4a6c-8d9e-1f0a2b3c4d56';
  const mandateId = '1b6a6a2e-9d6e-4e58-8a2f-0f0f2c3b4d55';
  const basePath = `/api/v1/v1/doctors/${midwifeDoctorId}/mandates`;
  const instructionObjectId = 'd4c9a1f2-6b3e-4a7c-9e10-2f5b8c3d4e61';
  const instructionStorageKey = `doctor-mandates/${midwifeDoctorId}/${instructionObjectId}.pdf`;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const authorityRepositoryMock = {
    findClinicianById: jest.fn(),
    listByDoctor: jest.fn(),
    findById: jest.fn(),
    hasLiveAuthority: jest.fn(),
    hasActiveAuthority: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    listExpiringAuthorities: jest.fn(),
    claimExpiryNotice: jest.fn(),
  };

  const mandateRepositoryMock = {
    listByMidwife: jest.fn(),
    findById: jest.fn(),
    findCovering: jest.fn(),
    findOverlapping: jest.fn(),
    create: jest.fn(),
    revoke: jest.fn(),
  };

  const auditRepositoryMock = {
    createAuditLog: jest.fn().mockResolvedValue(undefined),
  };

  const objectStorageMock = {
    generateObjectKey: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    getSignedUrl: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const midwife = { id: midwifeDoctorId, fullName: 'Bd. Siti Aminah', profession: 'MIDWIFE' };
  const doctor = { id: mandatingDoctorId, fullName: 'dr. Budi Santoso', profession: 'DOCTOR' };

  const mandateRecord = {
    id: mandateId,
    midwifeDoctorId,
    mandatingDoctorId,
    mandatingDoctorName: 'dr. Budi Santoso',
    kind: 'MANDATE',
    instruction: 'Pemasangan dan pencabutan IUD pada pasien KB',
    icd9cmCodes: ['69.7', '97.71'],
    validFrom: new Date('2026-09-01T00:00:00.000Z'),
    validUntil: new Date('2026-12-01T00:00:00.000Z'),
    instructionStorageKey,
    instructionMimeType: 'application/pdf',
    instructionSizeBytes: 4096,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdById: 'admin-user',
    createdAt: new Date('2026-08-30T03:00:00.000Z'),
    updatedAt: new Date('2026-08-30T03:00:00.000Z'),
    deletedAt: null,
  };

  const createPayload = {
    kind: 'MANDATE',
    mandatingDoctorId,
    instruction: 'Pemasangan dan pencabutan IUD pada pasien KB',
    icd9cmCodes: ['69.7', '97.71'],
    validFrom: '2026-09-01',
    validUntil: '2026-12-01',
    instructionStorageKey,
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        { role: { code: 'ADMIN', permissions: permissions.map((permission) => ({ permission })) } },
      ],
    });
  }

  const readGrant = { action: 'read', resource: 'DoctorMandate', scope: 'ANY' as const };
  const writeGrant = { action: 'write', resource: 'DoctorMandate', scope: 'ANY' as const };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(DoctorAuthorityRepository)
      .useValue(authorityRepositoryMock)
      .overrideProvider(DoctorMandateRepository)
      .useValue(mandateRepositoryMock)
      .overrideProvider(AuditRepository)
      .useValue(auditRepositoryMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auditRepositoryMock.createAuditLog.mockResolvedValue(undefined);
    authorityRepositoryMock.findClinicianById.mockImplementation(async (id: string) =>
      id === midwifeDoctorId ? midwife : doctor,
    );
    mandateRepositoryMock.listByMidwife.mockResolvedValue([mandateRecord]);
    mandateRepositoryMock.findById.mockResolvedValue(mandateRecord);
    mandateRepositoryMock.findOverlapping.mockResolvedValue(1);
    mandateRepositoryMock.create.mockResolvedValue(mandateRecord);
    mandateRepositoryMock.revoke.mockImplementation(
      async (_id: string, payload: Record<string, unknown>) => ({ ...mandateRecord, ...payload }),
    );
    objectStorageMock.headObject.mockResolvedValue({
      contentType: 'application/pdf',
      sizeBytes: 4096,
    });
    objectStorageMock.getSignedUrl.mockResolvedValue({
      url: 'https://storage.local/signed',
      expiresAt: '2026-09-15T04:00:00.000Z',
    });
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get(basePath);

    expect(response.status).toBe(401);
  });

  it('returns 403 for a reader holding only the doctor directory permission', async () => {
    const token = await buildToken('directory-user', 'directory@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get(basePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(mandateRepositoryMock.listByMidwife).not.toHaveBeenCalled();
  });

  it('returns 403 for a reader holding the authority permission but not the mandate one', async () => {
    const token = await buildToken('authority-user', 'authority@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'DoctorAuthority', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get(basePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('lists mandates without exposing the instruction storage key', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([readGrant]);

    const response = await request(app.getHttpServer())
      .get(basePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        id: mandateId,
        kind: 'MANDATE',
        mandatingDoctorName: 'dr. Budi Santoso',
        icd9cmCodes: ['69.7', '97.71'],
        validFrom: '2026-09-01',
        validUntil: '2026-12-01',
        instructionMimeType: 'application/pdf',
      }),
    );
    expect(response.body.data[0]).not.toHaveProperty('instructionStorageKey');
  });

  it('refuses a read grant on the write route', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([readGrant]);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(403);
    expect(mandateRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('records a mandate with 201 and writes an audit row naming the actor', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(201);
    expect(mandateRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        midwifeDoctorId,
        mandatingDoctorId,
        kind: 'MANDATE',
        icd9cmCodes: ['69.7', '97.71'],
        createdById: 'admin-user',
        instructionDocument: {
          storageKey: instructionStorageKey,
          mimeType: 'application/pdf',
          sizeBytes: 4096,
        },
      }),
    );
    expect(auditRepositoryMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCTOR_MANDATE_GRANTED',
        resource: 'doctor-mandate',
        actorUserId: 'admin-user',
        resourceId: mandateId,
      }),
    );
  });

  // D-036 §3: an overlap informs rather than refuses, so the row is written
  // and the warning travels with it.
  it('warns about an overlapping live mandate instead of refusing it', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    mandateRepositoryMock.findOverlapping.mockResolvedValue(2);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(201);
    expect(response.body.data.policyWarnings).toEqual(['OVERLAPS_EXISTING_MANDATE']);
  });

  it('refuses a mandating profile that is a midwife with 422 DOCTOR_MANDATE_INVALID_PARTIES', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    // A bidan cannot pass on what she was delegated.
    authorityRepositoryMock.findClinicianById.mockResolvedValue(midwife);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(422);
    expect(response.body.error).toEqual(
      expect.objectContaining({ code: 'DOCTOR_MANDATE_INVALID_PARTIES' }),
    );
    expect(mandateRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('refuses a mandate recorded against a doctor rather than a midwife', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    authorityRepositoryMock.findClinicianById.mockResolvedValue(doctor);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('DOCTOR_MANDATE_INVALID_PARTIES');
  });

  it('refuses an empty procedure list before it reaches the service', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...createPayload, icd9cmCodes: [] });

    expect(response.status).toBe(400);
    expect(mandateRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('refuses an instruction key minted for another midwife', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...createPayload,
        instructionStorageKey: `doctor-mandates/${mandatingDoctorId}/${instructionObjectId}.pdf`,
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('DOCTOR_MANDATE_INSTRUCTION_REQUIRED');
    expect(objectStorageMock.headObject).not.toHaveBeenCalled();
  });

  it('revokes a mandate and writes the revoke audit row', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(`${basePath}/${mandateId}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Dokter pemberi mandat pindah praktik' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('REVOKED');
    expect(auditRepositoryMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCTOR_MANDATE_REVOKED',
        resource: 'doctor-mandate',
        resourceId: mandateId,
      }),
    );
  });

  it('refuses to revoke a mandate that is already revoked', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    mandateRepositoryMock.findById.mockResolvedValue({
      ...mandateRecord,
      revokedAt: new Date('2026-09-10T02:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post(`${basePath}/${mandateId}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Dicabut dua kali' });

    expect(response.status).toBe(409);
    expect(mandateRepositoryMock.revoke).not.toHaveBeenCalled();
  });

  it('signs the instruction download as an attachment under its stored type', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([readGrant]);

    const response = await request(app.getHttpServer())
      .get(`${basePath}/${mandateId}/instruction/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(objectStorageMock.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: instructionStorageKey,
        responseContentType: 'application/pdf',
      }),
    );
  });
});
