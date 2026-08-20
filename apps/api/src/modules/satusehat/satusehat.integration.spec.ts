import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SatusehatMasterDataClient } from '../../common/satusehat/satusehat-master-data.client';
import { SatusehatError } from '../../common/satusehat/satusehat.error';
import { AuthRepository } from '../auth/repository/auth.repository';
import { SatusehatLinkRepository } from './repository/satusehat-link.repository';

describe('SATUSEHAT link integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const satusehatLinkRepositoryMock = {
    findPatientLinkTarget: jest.fn(),
    savePatientIhsNumber: jest.fn(),
    findDoctorLinkTarget: jest.fn(),
    saveDoctorIhsNumber: jest.fn(),
  };

  const masterDataClientMock = {
    findPatientIhsNumberByNik: jest.fn(),
    findPractitionerIhsNumberByNik: jest.fn(),
  };

  const auditServiceMock = {
    record: jest.fn(),
    recordOrThrow: jest.fn(),
  };

  const prismaServiceMock = {
    // IMP-8: `FeatureGuard` resolves this controller's entitlement through
    // Prisma on every request, and this stub replaces Prisma wholesale — so
    // the delegate has to exist here or every route in the suite answers 500.
    // No rows means no key is disabled, which is the fail-open default.
    featureEntitlement: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const patientId = 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0';
  const doctorId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  const syntheticNik = '3204124101900002';

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(SatusehatLinkRepository)
      .useValue(satusehatLinkRepositoryMock)
      .overrideProvider(SatusehatMasterDataClient)
      .useValue(masterDataClientMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({
      defaultVersion: '1',
      prefix: 'v',
      type: VersioningType.URI,
    });
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
  });

  it('returns 401 when the bearer token is missing', async () => {
    const response = await request(app.getHttpServer()).post(
      `/api/v1/v1/satusehat/patients/${patientId}/link`,
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 when the user lacks satusehat.link permission', async () => {
    const token = await buildToken('no-link-user', 'no-link@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'Patient', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('links a patient by NIK and stores the IHS number', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: syntheticNik,
      hasSatusehatPatientId: false,
    });
    masterDataClientMock.findPatientIhsNumberByNik.mockResolvedValue('P02478375538');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      patientId,
      hasSatusehatPatientId: true,
      alreadyLinked: false,
    });
    expect(satusehatLinkRepositoryMock.savePatientIhsNumber).toHaveBeenCalledWith({
      patientId,
      ihsNumber: 'P02478375538',
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SATUSEHAT_PATIENT_LINKED', resourceId: patientId }),
    );
    expect(JSON.stringify(response.body)).not.toContain(syntheticNik);
    expect(JSON.stringify(response.body)).not.toContain('P02478375538');
  });

  it('is idempotent for an already linked patient', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: syntheticNik,
      hasSatusehatPatientId: true,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.alreadyLinked).toBe(true);
    expect(masterDataClientMock.findPatientIhsNumberByNik).not.toHaveBeenCalled();
  });

  it('returns 422 when the patient has no NIK on record', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: null,
      hasSatusehatPatientId: false,
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
  });

  it('returns 404 when the master patient index has no match', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: syntheticNik,
      hasSatusehatPatientId: false,
    });
    masterDataClientMock.findPatientIhsNumberByNik.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(satusehatLinkRepositoryMock.savePatientIhsNumber).not.toHaveBeenCalled();
  });

  it('returns 503 when the SATUSEHAT adapter is not configured', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: syntheticNik,
      hasSatusehatPatientId: false,
    });
    masterDataClientMock.findPatientIhsNumberByNik.mockRejectedValue(
      new SatusehatError('SATUSEHAT_NOT_CONFIGURED', 'not configured'),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(503);
  });

  it('returns 502 when SATUSEHAT is unreachable', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findPatientLinkTarget.mockResolvedValue({
      id: patientId,
      nik: syntheticNik,
      hasSatusehatPatientId: false,
    });
    masterDataClientMock.findPatientIhsNumberByNik.mockRejectedValue(
      new SatusehatError('SATUSEHAT_TIMEOUT', 'timed out'),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/patients/${patientId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(502);
  });

  it('links a doctor by NIK and returns the practitioner IHS number', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);
    satusehatLinkRepositoryMock.findDoctorLinkTarget.mockResolvedValue({
      id: doctorId,
      nik: syntheticNik,
      satusehatPractitionerId: null,
    });
    masterDataClientMock.findPractitionerIhsNumberByNik.mockResolvedValue('N10000001');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/satusehat/doctors/${doctorId}/link`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      doctorId,
      satusehatPractitionerId: 'N10000001',
      alreadyLinked: false,
    });
    expect(satusehatLinkRepositoryMock.saveDoctorIhsNumber).toHaveBeenCalledWith({
      doctorId,
      ihsNumber: 'N10000001',
    });
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SATUSEHAT_DOCTOR_LINKED', resourceId: doctorId }),
    );
  });

  it('rejects a malformed profile id with 400 before touching the service', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'link', resource: 'Satusehat', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/patients/not-a-uuid/link')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(satusehatLinkRepositoryMock.findPatientLinkTarget).not.toHaveBeenCalled();
  });
});
