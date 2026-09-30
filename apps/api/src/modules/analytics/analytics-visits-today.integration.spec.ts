import { randomUUID } from 'node:crypto';

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
import { AnalyticsOperationsService } from './service/analytics-operations.service';

// 10:00 WIB on Tuesday 9 December 2031; last Tuesday is 2 December.
const NOW = new Date('2031-12-09T03:00:00.000Z');
const TODAY = '2031-12-09';
const LAST_WEEK = '2031-12-02';
const MINUTE_MS = 60_000;

type SeededVisit = {
  day: string;
  minutesAfterSeven: number;
  status: 'PENDING' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED';
  isCheckedIn: boolean;
};

/**
 * P29-T16 against a real PostgreSQL: 42 visits checked in before 10:00
 * today and 38 before 10:00 last Tuesday, plus visits after 10:00 on both
 * days, a patient registered but not yet checked in, and a cancellation.
 */
describe('Analytics visits today against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;
  let operationsService: AnalyticsOperationsService;

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const specialtyId = randomUUID();
  const patientId = randomUUID();
  const registrationIds: string[] = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn(async () => true) };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function buildVisits(): SeededVisit[] {
    const before = (day: string, count: number): SeededVisit[] =>
      Array.from({ length: count }, (_, index) => ({
        day,
        minutesAfterSeven: index * 4,
        status: 'COMPLETED' as const,
        isCheckedIn: true,
      }));
    return [
      ...before(TODAY, 42),
      ...before(LAST_WEEK, 38),
      // After 10:00: last week's are long completed, and still do not count.
      { day: LAST_WEEK, minutesAfterSeven: 200, status: 'COMPLETED', isCheckedIn: true },
      { day: LAST_WEEK, minutesAfterSeven: 400, status: 'COMPLETED', isCheckedIn: true },
      { day: TODAY, minutesAfterSeven: 190, status: 'CHECKED_IN', isCheckedIn: true },
      // Registered before 10:00 but not checked in, and cancelled: not visits.
      { day: TODAY, minutesAfterSeven: 30, status: 'PENDING', isCheckedIn: false },
      { day: TODAY, minutesAfterSeven: 40, status: 'CANCELLED', isCheckedIn: false },
    ];
  }

  async function seedVisits(): Promise<void> {
    const rows = buildVisits().map((visit, index) => {
      const at = new Date(
        new Date(`${visit.day}T07:00:00+07:00`).getTime() + visit.minutesAfterSeven * MINUTE_MS,
      );
      return {
        id: randomUUID(),
        patientId,
        specialtyId,
        poliQueueNumber: index + 1,
        status: visit.status,
        registeredAt: at,
        checkedInAt: visit.isCheckedIn ? at : null,
      };
    });
    await prisma.registration.createMany({ data: rows });
    registrationIds.push(...rows.map((row) => row.id));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
    operationsService = moduleRef.get(AnalyticsOperationsService);
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Hari Ini',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    await seedVisits();
  });

  afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given 42 visits by 10:00 today and 38 by 10:00 last Tuesday, then it counts 42 and +10.5%', async () => {
    const actual = await operationsService.getVisitsToday(NOW);

    expect(actual.data).toEqual({
      date: TODAY,
      comparisonDate: LAST_WEEK,
      asOf: NOW.toISOString(),
      visits: 42,
      comparisonVisits: 38,
      changePercent: 10.5,
    });
  });

  it('answers on the route to the operations key, and refuses without it', async () => {
    const token = await jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              { permission: { action: 'read-operations', resource: 'Analytics', scope: 'ANY' } },
            ],
          },
        },
      ],
    });

    const allowed = await request(app.getHttpServer())
      .get('/api/v1/v1/analytics/operations/today')
      .set('Authorization', `Bearer ${token}`);
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [{ role: { code: 'PHARMACIST', permissions: [] } }],
    });
    const refused = await request(app.getHttpServer())
      .get('/api/v1/v1/analytics/operations/today')
      .set('Authorization', `Bearer ${token}`);

    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual(
      expect.objectContaining({ visits: expect.any(Number), comparisonVisits: expect.any(Number) }),
    );
    expect(refused.status).toBe(403);
  });
});
