import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';

const OPERATIONS_PATH = '/api/v1/v1/analytics/operations';
const ADMIN_ANALYTICS_PERMISSIONS = [
  { action: 'read-operations', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'read-finance', resource: 'Analytics', scope: 'ANY' as const },
];
const DOCTOR_ANALYTICS_PERMISSIONS = [
  { action: 'read-practice', resource: 'Analytics', scope: 'OWN' as const },
];

/**
 * P29-T01 acceptance over the wired stack: permission guard and feature gate
 * in front of the operations dashboard, with the repositories replaced.
 */
describe('Analytics integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
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
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
  });

  it('given ADMIN, when reading the operations dashboard, then answers 200 with asOf', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Number.isNaN(Date.parse(response.body.data.asOf))).toBe(false);
  });

  it('given DOCTOR, when reading the operations dashboard, then answers 403', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('given the analytics feature is off, then answers FEATURE_DISABLED even for ADMIN', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);
    featureAvailabilityCacheMock.isEnabled.mockImplementation(
      async (featureKey) => featureKey !== 'analytics',
    );

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });
});
