import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import sharp from 'sharp';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { ClinicProfileRepository } from './repository/clinic-profile.repository';

const CLINIC_PROFILE_PATH = '/api/v1/v1/clinic-profile';
const STAGED_KEY = 'clinic-profile/logo/staged/2f1c8e0a-9b3d-4f77-b0a1-6d5e4c3b2a19';
const STORED_KEY = 'clinic-profile/logo/stored/8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d.png';

/**
 * P16-T02 acceptance over the wired stack: the guard, the Zod pipe, the
 * response envelope, and the exception filter, with only the database and the
 * bucket replaced. Prisma is mocked, so this runs in the ordinary unit CI job
 * alongside the rest of the billing integration suite.
 */
describe('Clinic profile integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };
  const clinicProfileRepositoryMock = {
    findProfile: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    getSignedUrl: jest.fn(),
    headObject: jest.fn(),
    getObject: jest.fn(),
    uploadObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

  const updatedAt = new Date('2026-09-18T02:15:00.000Z');

  const profileRecord = {
    id: 'f0e1d2c3-4b5a-4988-9776-655443322110',
    name: 'Klinik Sehat Bersama',
    legalName: 'PT Sehat Bersama Indonesia',
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '(022) 1234567',
    email: 'halo@kliniksehat.id',
    licenseNumber: '440/1234/DPMPTSP',
    taxId: '01.234.567.8-901.000',
    logoStorageKey: null,
    logoMimeType: null,
    createdAt: updatedAt,
    updatedAt,
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: { code: roleCode, permissions: permissions.map((permission) => ({ permission })) },
        },
      ],
    });
  }

  async function buildPngBytes(): Promise<Uint8Array> {
    return new Uint8Array(
      await sharp({
        create: {
          width: 48,
          height: 48,
          channels: 4,
          background: { r: 15, g: 118, b: 110, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(ClinicProfileRepository)
      .useValue(clinicProfileRepositoryMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageServiceMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    objectStorageServiceMock.deleteObject.mockResolvedValue(undefined);
    objectStorageServiceMock.uploadObject.mockResolvedValue({ key: STORED_KEY });
    objectStorageServiceMock.getSignedUrl.mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: '2026-09-18T02:20:00.000Z',
    });
  });

  it('refuses an unauthenticated read', async () => {
    const response = await request(app.getHttpServer()).get(CLINIC_PROFILE_PATH);

    expect(response.status).toBe(401);
  });

  it('answers 404 in the standard error envelope before the profile is configured', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .get(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      message: 'The clinic profile has not been configured yet',
    });
    expect(response.body.error.code).toBeDefined();
  });

  it('returns the profile with a signed logo URL and no storage key', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue({
      ...profileRecord,
      logoStorageKey: STORED_KEY,
      logoMimeType: 'image/png',
    });

    const response = await request(app.getHttpServer())
      .get(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'Klinik Sehat Bersama',
      hasLogo: true,
      logoUrl: 'https://storage.example/signed',
    });
    expect(JSON.stringify(response.body)).not.toContain('clinic-profile/logo');
  });

  it('lets a doctor read the profile', async () => {
    // A prescription and a referral letter are both headed with the clinic's
    // identity, so a clinician who cannot read it cannot produce one.
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', [
      { action: 'read', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue(profileRecord);

    const response = await request(app.getHttpServer())
      .get(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it('refuses a doctor the write, holding only the read grant', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', [
      { action: 'read', resource: 'ClinicProfile', scope: 'ANY' },
    ]);

    const patchResponse = await request(app.getHttpServer())
      .patch(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Klinik Milik Saya' });
    const uploadResponse = await request(app.getHttpServer())
      .post(`${CLINIC_PROFILE_PATH}/logo-upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'image/png', sizeBytes: 2048 });

    expect(patchResponse.status).toBe(403);
    expect(uploadResponse.status).toBe(403);
    expect(clinicProfileRepositoryMock.updateProfile).not.toHaveBeenCalled();
  });

  it('audits an administrator update', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'write', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue(profileRecord);
    clinicProfileRepositoryMock.updateProfile.mockResolvedValue({
      ...profileRecord,
      address: 'Jl. Asia Afrika No. 1, Bandung',
    });

    const response = await request(app.getHttpServer())
      .patch(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ address: 'Jl. Asia Afrika No. 1, Bandung' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Clinic profile updated');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resource: 'clinic-profile',
        resourceId: profileRecord.id,
        metadata: { changedFields: ['address'], wasCreated: false },
      }),
    );
  });

  it('rejects a claimed upload whose bytes are not the image it declared, leaving nothing behind', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'write', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue(profileRecord);
    // A PDF, uploaded under an image/png declaration.
    const forgedContent = new Uint8Array(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3', 'latin1'));
    objectStorageServiceMock.headObject.mockResolvedValue({
      key: STAGED_KEY,
      sizeBytes: forgedContent.byteLength,
      contentType: 'image/png',
    });
    objectStorageServiceMock.getObject.mockResolvedValue({
      key: STAGED_KEY,
      body: forgedContent,
      contentType: 'image/png',
    });

    const response = await request(app.getHttpServer())
      .patch(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ logoStorageKey: STAGED_KEY });

    expect(response.status).toBe(400);
    expect(objectStorageServiceMock.deleteObject).toHaveBeenCalledWith({ key: STAGED_KEY });
    expect(objectStorageServiceMock.uploadObject).not.toHaveBeenCalled();
    expect(clinicProfileRepositoryMock.updateProfile).not.toHaveBeenCalled();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DOCUMENT_UPLOAD_REJECTED', resource: 'clinic-profile' }),
    );
  });

  it('stores a re-encoded PNG when a real image is claimed', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'write', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    clinicProfileRepositoryMock.findProfile.mockResolvedValue(profileRecord);
    clinicProfileRepositoryMock.updateProfile.mockResolvedValue({
      ...profileRecord,
      logoStorageKey: STORED_KEY,
      logoMimeType: 'image/png',
    });
    objectStorageServiceMock.headObject.mockResolvedValue({
      key: STAGED_KEY,
      sizeBytes: 4096,
      contentType: 'image/png',
    });
    objectStorageServiceMock.getObject.mockResolvedValue({
      key: STAGED_KEY,
      body: await buildPngBytes(),
      contentType: 'image/png',
    });
    objectStorageServiceMock.generateObjectKey.mockReturnValue(STORED_KEY);

    const response = await request(app.getHttpServer())
      .patch(CLINIC_PROFILE_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ logoStorageKey: STAGED_KEY });

    expect(response.status).toBe(200);
    expect(response.body.data.hasLogo).toBe(true);
    expect(objectStorageServiceMock.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: STORED_KEY, contentType: 'image/png' }),
    );
  });

  it('signs a logo upload for an administrator', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'write', resource: 'ClinicProfile', scope: 'ANY' },
    ]);
    objectStorageServiceMock.generateObjectKey.mockReturnValue(STAGED_KEY);
    objectStorageServiceMock.getSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.example/put',
      key: STAGED_KEY,
      expiresAt: '2026-09-18T02:20:00.000Z',
      requiredHeaders: { 'Content-Type': 'image/png', 'Content-Length': '2048' },
    });

    const response = await request(app.getHttpServer())
      .post(`${CLINIC_PROFILE_PATH}/logo-upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mimeType: 'image/png', sizeBytes: 2048 });

    expect(response.status).toBe(200);
    expect(response.body.data.storageKey).toBe(STAGED_KEY);
  });

  it.each([
    ['a type outside the surface allowlist', { mimeType: 'image/svg+xml', sizeBytes: 2048 }],
    ['a file above the surface size cap', { mimeType: 'image/png', sizeBytes: 8 * 1024 * 1024 }],
  ])('refuses to sign %s', async (_label, payload) => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'write', resource: 'ClinicProfile', scope: 'ANY' },
    ]);

    const response = await request(app.getHttpServer())
      .post(`${CLINIC_PROFILE_PATH}/logo-upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(objectStorageServiceMock.getSignedUploadUrl).not.toHaveBeenCalled();
  });
});
