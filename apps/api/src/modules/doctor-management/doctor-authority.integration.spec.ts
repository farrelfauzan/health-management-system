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

/**
 * P25-T02. The route surface of a midwife's delegated authorities, with the
 * repository, the audit writer and object storage stubbed at their seams.
 */
describe('DoctorAuthority integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const authorityId = '7c2e1f7a-3b6d-4d0e-9a1f-5e8c2b7d4a10';
  const basePath = `/api/v1/v1/doctors/${doctorId}/authorities`;

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

  // Writes go through @Audited; the Prisma stub has no delegate to write the
  // row with, so the audit repository is the seam the assertion reads.
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

  const midwife = { id: doctorId, fullName: 'Bd. Siti Aminah', profession: 'MIDWIFE' };

  const authorityRecord = {
    id: authorityId,
    doctorId,
    kind: 'IUD_IMPLANT',
    trainingCertificateNumber: null,
    decreeNumber: '440/123/2026',
    decreeIssuedAt: new Date('2025-12-15T00:00:00.000Z'),
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: new Date('2027-12-31T00:00:00.000Z'),
    decreeStorageKey: null,
    decreeMimeType: null,
    decreeSizeBytes: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdById: 'admin-user',
    createdAt: new Date('2026-01-02T03:00:00.000Z'),
    updatedAt: new Date('2026-01-02T03:00:00.000Z'),
    deletedAt: null,
  };

  const createPayload = {
    kind: 'IUD_IMPLANT',
    decreeNumber: '440/123/2026',
    decreeIssuedAt: '2025-12-15',
    validFrom: '2026-01-01',
    validUntil: '2027-12-31',
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

  const readGrant = { action: 'read', resource: 'DoctorAuthority', scope: 'ANY' as const };
  const writeGrant = { action: 'write', resource: 'DoctorAuthority', scope: 'ANY' as const };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(DoctorAuthorityRepository)
      .useValue(authorityRepositoryMock)
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
    authorityRepositoryMock.findClinicianById.mockResolvedValue(midwife);
    authorityRepositoryMock.listByDoctor.mockResolvedValue([authorityRecord]);
    authorityRepositoryMock.findById.mockResolvedValue(authorityRecord);
    authorityRepositoryMock.hasLiveAuthority.mockResolvedValue(false);
    authorityRepositoryMock.create.mockResolvedValue(authorityRecord);
    authorityRepositoryMock.revoke.mockImplementation(
      async (_id: string, payload: Record<string, unknown>) => ({
        ...authorityRecord,
        ...payload,
      }),
    );
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get(basePath);

    expect(response.status).toBe(401);
  });

  it('returns 403 for a reader holding only doctor.read:any', async () => {
    const token = await buildToken('directory-user', 'directory@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get(basePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(authorityRepositoryMock.listByDoctor).not.toHaveBeenCalled();
  });

  it('lists authorities for doctor.authority.read:any without exposing the storage key', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([readGrant]);

    const response = await request(app.getHttpServer())
      .get(basePath)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ id: authorityId, kind: 'IUD_IMPLANT', hasDecree: false }),
    );
    expect(response.body.data[0]).not.toHaveProperty('decreeStorageKey');
  });

  it('grants with 201 and writes an audit row naming the actor', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(
      expect.objectContaining({ id: authorityId, status: expect.any(String) }),
    );
    expect(authorityRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId, kind: 'IUD_IMPLANT', createdById: 'admin-user' }),
    );
    expect(auditRepositoryMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCTOR_AUTHORITY_GRANTED',
        resource: 'doctor-authority',
        actorUserId: 'admin-user',
        resourceId: authorityId,
      }),
    );
  });

  it('refuses a DOCTOR profile with 422 DOCTOR_AUTHORITY_REQUIRES_MIDWIFE', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    authorityRepositoryMock.findClinicianById.mockResolvedValue({
      ...midwife,
      profession: 'DOCTOR',
    });

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('DOCTOR_AUTHORITY_REQUIRES_MIDWIFE');
    expect(auditRepositoryMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('refuses a second live authority of one kind with 409 DOCTOR_AUTHORITY_ALREADY_ACTIVE', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    authorityRepositoryMock.hasLiveAuthority.mockResolvedValue(true);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send(createPayload);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DOCTOR_AUTHORITY_ALREADY_ACTIVE');
  });

  it('refuses an upload key minted outside this clinician’s prefix before touching storage', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(basePath)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...createPayload,
        decreeStorageKey:
          'doctor-authorities/00000000-0000-4000-8000-000000000000/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf',
      });

    expect(response.status).toBe(400);
    expect(objectStorageMock.headObject).not.toHaveBeenCalled();
    expect(authorityRepositoryMock.create).not.toHaveBeenCalled();
  });

  it('rejects a kind on PATCH: the update body is strict', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .patch(`${basePath}/${authorityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'MTBS' });

    expect(response.status).toBe(400);
    expect(authorityRepositoryMock.update).not.toHaveBeenCalled();
  });

  it('revokes with the actor and reason, and audits it', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);

    const response = await request(app.getHttpServer())
      .post(`${basePath}/${authorityId}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Decision letter withdrawn' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('REVOKED');
    expect(authorityRepositoryMock.revoke).toHaveBeenCalledWith(
      authorityId,
      expect.objectContaining({
        revokedById: 'admin-user',
        revokeReason: 'Decision letter withdrawn',
        revokedAt: expect.any(Date),
      }),
    );
    expect(auditRepositoryMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCTOR_AUTHORITY_REVOKED',
        actorUserId: 'admin-user',
        resourceId: authorityId,
      }),
    );
  });

  it('signs uploads under the clinician prefix for a writer', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions([writeGrant]);
    const storageKey = `doctor-authorities/${doctorId}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf`;
    objectStorageMock.generateObjectKey.mockReturnValue(storageKey);
    objectStorageMock.getSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.example.com/signed',
      key: storageKey,
      expiresAt: '2026-01-02T03:15:00.000Z',
      requiredHeaders: { 'Content-Type': 'application/pdf' },
    });

    const response = await request(app.getHttpServer())
      .post(`${basePath}/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'application/pdf', sizeBytes: 1024 });

    expect(response.status).toBe(201);
    expect(objectStorageMock.generateObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyPrefix: `doctor-authorities/${doctorId}` }),
    );
    expect(response.body.data.storageKey).toBe(storageKey);
  });
});
