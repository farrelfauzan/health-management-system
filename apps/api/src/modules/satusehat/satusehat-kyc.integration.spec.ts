import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SatusehatKycClient } from '../../common/satusehat/satusehat-kyc.client';
import { AuthRepository } from '../auth/repository/auth.repository';
import { SatusehatKycOperatorRepository } from './repository/satusehat-kyc-operator.repository';

/** Sixteen digits that are nobody's number. */
const NIK_PLACEHOLDER = '0000000000000000';
const PATIENT_ID = '4f1c2a9e-6b3d-4e8a-9c7f-1a2b3c4d5e6f';
const VALIDATION_URL = 'https://kyc.example/validate?token=integration-token';
const KYC_PERMISSION = { action: 'verify', resource: 'SatusehatKyc', scope: 'ANY' as const };

describe('SATUSEHAT KYC session (P24-T16)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const operatorRepositoryMock = { findOperator: jest.fn() };
  const kycClientMock = { getStatus: jest.fn(), generateValidationUrl: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = {
    // FeatureGuard resolves the `satusehat` entitlement through Prisma on every
    // request; no rows means nothing is disabled.
    featureEntitlement: { findMany: jest.fn(() => Promise.resolve([])) },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActor(
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(SatusehatKycOperatorRepository)
      .useValue(operatorRepositoryMock)
      .overrideProvider(SatusehatKycClient)
      .useValue(kycClientMock)
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
    kycClientMock.getStatus.mockReturnValue({ isEnabled: true, disabledReason: null });
    kycClientMock.generateValidationUrl.mockResolvedValue({
      url: VALIDATION_URL,
      token: 'integration-token',
    });
    operatorRepositoryMock.findOperator.mockResolvedValue({
      name: 'Bidan Sari',
      nik: NIK_PLACEHOLDER,
    });
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/v1/satusehat/kyc/sessions');

    expect(response.status).toBe(401);
  });

  it.each(['ADMIN', 'MIDWIFE'])(
    'lets %s start a session and audits it without the NIK or URL',
    async (roleCode) => {
      const token = await buildToken('actor-user', 'desk@hms.local');
      mockActor(roleCode, [KYC_PERMISSION]);

      const response = await request(app.getHttpServer())
        .post('/api/v1/v1/satusehat/kyc/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId: PATIENT_ID });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({ url: VALIDATION_URL, expiresAt: null });
      expect(kycClientMock.generateValidationUrl).toHaveBeenCalledWith({
        name: 'Bidan Sari',
        nik: NIK_PLACEHOLDER,
      });
      expect(auditServiceMock.record).toHaveBeenCalledTimes(1);
      const auditInput = auditServiceMock.record.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(auditInput).toMatchObject({
        action: 'SATUSEHAT_KYC_STARTED',
        actorUserId: 'actor-user',
        patientId: PATIENT_ID,
      });
      const serialised = JSON.stringify(auditInput);
      expect(serialised).not.toContain(NIK_PLACEHOLDER);
      expect(serialised).not.toContain('integration-token');
      expect(serialised).not.toContain(VALIDATION_URL);
    },
  );

  it('returns 403 for a PHARMACIST without the key', async () => {
    const token = await buildToken('actor-user', 'apoteker@hms.local');
    mockActor('PHARMACIST', [{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/kyc/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(403);
    expect(kycClientMock.generateValidationUrl).not.toHaveBeenCalled();
  });

  it('refuses an operator without a NIK with 422 and reports it on the status route', async () => {
    const token = await buildToken('actor-user', 'desk@hms.local');
    mockActor('ADMIN', [KYC_PERMISSION]);
    operatorRepositoryMock.findOperator.mockResolvedValue({ name: 'Rani Putri', nik: null });

    const sessionResponse = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/kyc/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const statusResponse = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/kyc/status')
      .set('Authorization', `Bearer ${token}`);

    expect(sessionResponse.status).toBe(422);
    expect(sessionResponse.body.error.code).toBe('OPERATOR_NIK_MISSING');
    expect(kycClientMock.generateValidationUrl).not.toHaveBeenCalled();
    expect(auditServiceMock.record).not.toHaveBeenCalled();
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data).toEqual({
      isEnabled: false,
      disabledReason: 'OPERATOR_NIK_MISSING',
      hasOperatorNik: false,
    });
  });

  it('reports the deployment reason on the status route when the keys are absent', async () => {
    const token = await buildToken('actor-user', 'desk@hms.local');
    mockActor('ADMIN', [KYC_PERMISSION]);
    kycClientMock.getStatus.mockReturnValue({
      isEnabled: false,
      disabledReason: 'KYC_KEYS_NOT_CONFIGURED',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/kyc/status')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      isEnabled: false,
      disabledReason: 'KYC_KEYS_NOT_CONFIGURED',
      hasOperatorNik: true,
    });
  });

  it('rejects a malformed patient id with 400', async () => {
    const token = await buildToken('actor-user', 'desk@hms.local');
    mockActor('ADMIN', [KYC_PERMISSION]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/kyc/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: 'not-a-uuid' });

    expect(response.status).toBe(400);
  });
});
