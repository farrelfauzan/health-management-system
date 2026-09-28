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
import { AnalyticsOperationsRepository } from './repository/analytics-operations.repository';

const OPERATIONS_PATH = '/api/v1/v1/analytics/operations';
const SEPTEMBER_QUERY = { from: '2026-09-01', to: '2026-09-30' };
const ADMIN_ANALYTICS_PERMISSIONS = [
  { action: 'read-operations', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'read-finance', resource: 'Analytics', scope: 'ANY' as const },
];
const DOCTOR_ANALYTICS_PERMISSIONS = [
  { action: 'read-practice', resource: 'Analytics', scope: 'OWN' as const },
];

/**
 * P29-T01/T02 acceptance over the wired stack: permission guard, feature
 * gate and the shared filter in front of the operations dashboard, with the
 * repositories replaced.
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
  const analyticsOperationsRepositoryMock = {
    readSnapshot: jest.fn(async () => ({
      visitBuckets: [],
      newAndReturning: { newPatients: 0, returningPatients: 0 },
      poli: [],
      doctors: [],
      outcomes: [],
      channels: [],
      walkIns: 0,
      timings: {
        medianWaitMinutes: null,
        p90WaitMinutes: null,
        excludedWaitIntervals: 0,
        medianConsultMinutes: null,
        p90ConsultMinutes: null,
        excludedConsultIntervals: 0,
      },
      busiestHours: [],
      sessions: {
        cappedSessions: 0,
        capacity: 0,
        bookedAppointments: 0,
        movedSessions: 0,
        cancelledSessions: 0,
      },
      inpatient: null,
      inpatientDispositions: null,
    })),
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
      .overrideProvider(AnalyticsOperationsRepository)
      .useValue(analyticsOperationsRepositoryMock)
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

  it('given ADMIN and September, then answers the envelope with the clinic-day meta', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query(SEPTEMBER_QUERY)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({ visits: 0, noShowRatePercent: null });
    expect(response.body.data.series).toHaveLength(30);
    expect(response.body.meta).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      timezone: 'Asia/Jakarta',
      granularity: 'day',
    });
    expect(Number.isNaN(Date.parse(response.body.meta.generatedAt))).toBe(false);
  });

  it('given compare on for September, then the comparison period is all of August', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query({ ...SEPTEMBER_QUERY, compare: 'true' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.comparison).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(response.body.data.comparison.series).toHaveLength(31);
  });

  it('given 1 January 2024 to 30 September 2026, then answers 400', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query({ from: '2024-01-01', to: '2026-09-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.error)).toContain('Choose a range of at most 24 months');
  });

  it('given a payer filter, then answers 400 until visits record the payer', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query({ ...SEPTEMBER_QUERY, payerType: 'BPJS' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ANALYTICS_PAYER_FILTER_UNAVAILABLE');
  });

  it('given no dates, then answers 400', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it('given DOCTOR, when reading the operations dashboard, then answers 403', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_ANALYTICS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query(SEPTEMBER_QUERY)
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
      .query(SEPTEMBER_QUERY)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });
});
