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

const LABORATORY_PATH = '/api/v1/v1/analytics/laboratory';
const FINANCE_PATH = '/api/v1/v1/analytics/finance';
const DAY = '2031-11-12';
const ORDERED_AT = new Date(`${DAY}T09:00:00+07:00`);
const MINUTE_MS = 60_000;
// Ten released CBC orders: the median of these is 45, the p90 is 63.
const CBC_TURNAROUND_MINUTES = [20, 30, 40, 44, 45, 45, 46, 50, 60, 90];
const LAB_PERMISSION = { action: 'read-lab', resource: 'Analytics', scope: 'ANY' as const };

type SeededOrder = {
  source: 'ENCOUNTER' | 'WALK_IN' | 'EXTERNAL_REFERRAL';
  status: 'ORDERED' | 'IN_PROGRESS' | 'RELEASED' | 'CANCELLED';
  testIndexes: number[];
  releasedAfterMinutes?: number;
  isSentOut?: boolean;
  recollectCount?: number;
};

type LaboratoryTest = {
  labTestId: string;
  orders: number;
  releasedOrders: number;
  medianTurnaroundMinutes: number | null;
  p90TurnaroundMinutes: number | null;
};

/**
 * P29-T14 against a real PostgreSQL. On 12 November 2031, under a poli made
 * for this spec: ten released CBC orders, two of them with a glucose test
 * too; a glucose walk-in still being run whose sample was taken again; a
 * glucose order sent to an outside lab; and a cancelled CBC referral.
 */
describe('Analytics laboratory against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const testIds = [randomUUID(), randomUUID()];
  const registrationIds: string[] = [];
  const encounterIds: string[] = [];
  const orderIds: string[] = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function mockActor(roleCode: string): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'analytics-user',
      roles: [{ role: { code: roleCode, permissions: [{ permission: LAB_PERMISSION }] } }],
    });
  }

  async function readDashboard(
    path: string,
    query: Record<string, string> = {},
  ): Promise<request.Response> {
    const token = await jwtService.signAsync(
      { sub: 'analytics-user', email: 'analytics@hms.local' },
      { secret: 'dev-access-secret' },
    );
    return request(app.getHttpServer())
      .get(path)
      .query({ from: DAY, to: DAY, specialtyId, ...query })
      .set('Authorization', `Bearer ${token}`);
  }

  function buildOrders(): SeededOrder[] {
    return [
      ...CBC_TURNAROUND_MINUTES.map((minutes, index) => ({
        source: 'ENCOUNTER' as const,
        status: 'RELEASED' as const,
        testIndexes: index < 2 ? [0, 1] : [0],
        releasedAfterMinutes: minutes,
      })),
      { source: 'WALK_IN', status: 'IN_PROGRESS', testIndexes: [1], recollectCount: 1 },
      { source: 'WALK_IN', status: 'ORDERED', testIndexes: [1], isSentOut: true },
      { source: 'EXTERNAL_REFERRAL', status: 'CANCELLED', testIndexes: [0] },
    ];
  }

  async function seedRegistration(queueNumber: number): Promise<string> {
    const registration = await prisma.registration.create({
      data: {
        patientId,
        specialtyId,
        poliQueueNumber: queueNumber,
        status: 'COMPLETED',
        payerType: 'GENERAL',
        registeredAt: ORDERED_AT,
        checkedInAt: ORDERED_AT,
      },
    });
    registrationIds.push(registration.id);
    return registration.id;
  }

  async function seedOrders(): Promise<void> {
    const visitRegistrationId = await seedRegistration(1);
    const walkInRegistrationId = await seedRegistration(2);
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: visitRegistrationId,
        patientId,
        doctorId,
        status: 'FINISHED',
        startedAt: ORDERED_AT,
      },
    });
    encounterIds.push(encounter.id);
    for (const [index, order] of buildOrders().entries()) {
      const isEncounter = order.source === 'ENCOUNTER';
      const created = await prisma.labOrder.create({
        data: {
          orderNumber: `LAB-${suffix}-${index}`,
          source: order.source,
          registrationId: isEncounter ? visitRegistrationId : walkInRegistrationId,
          encounterId: isEncounter ? encounter.id : null,
          orderedById: isEncounter ? doctorId : null,
          externalRequesterName: order.source === 'EXTERNAL_REFERRAL' ? 'dr. Luar' : null,
          patientId,
          status: order.status,
          fulfilmentSite: order.isSentOut ? 'EXTERNAL' : 'INTERNAL',
          externalFacilityName: order.isSentOut ? 'Lab Rujukan' : null,
          recollectCount: order.recollectCount ?? 0,
          orderedAt: ORDERED_AT,
          releasedAt:
            order.releasedAfterMinutes === undefined
              ? null
              : new Date(ORDERED_AT.getTime() + order.releasedAfterMinutes * MINUTE_MS),
          cancelledAt: order.status === 'CANCELLED' ? ORDERED_AT : null,
          cancelReason: order.status === 'CANCELLED' ? 'Batal uji' : null,
          items: {
            create: order.testIndexes.map((testIndex) => ({
              labTestId: testIds[testIndex] as string,
            })),
          },
        },
      });
      orderIds.push(created.id);
    }
  }

  async function seedClinic(): Promise<void> {
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.create({
      data: { id: doctorId, licenseNumber: `LIC-${suffix}`, fullName: 'dr. Lab', specialtyId },
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Lab',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    await prisma.labTest.createMany({
      data: [
        {
          id: testIds[0] as string,
          code: `CBC-${suffix}`,
          name: 'Darah lengkap uji',
          specimenType: 'WHOLE_BLOOD',
          resultType: 'NUMERIC',
          unit: 'g/dL',
        },
        {
          id: testIds[1] as string,
          code: `GDS-${suffix}`,
          name: 'Gula darah uji',
          specimenType: 'WHOLE_BLOOD',
          resultType: 'NUMERIC',
          unit: 'mg/dL',
        },
      ],
    });
    await seedOrders();
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
    await seedClinic();
  });

  beforeEach(() => {
    mockActor('ADMIN');
    featureAvailabilityCacheMock.isEnabled.mockImplementation(async () => true);
  });

  afterAll(async () => {
    await prisma.labOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.labTest.deleteMany({ where: { id: { in: testIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given 10 released CBC orders with a median of 45 min, then CBC shows 45 min', async () => {
    const response = await readDashboard(LABORATORY_PATH);
    const tests = response.body.data.breakdowns.tests as LaboratoryTest[];

    expect(response.status).toBe(200);
    expect(tests.find((row) => row.labTestId === testIds[0])).toMatchObject({
      orders: 10,
      releasedOrders: 10,
      medianTurnaroundMinutes: 45,
      p90TurnaroundMinutes: 63,
    });
  });

  it('counts a test still being run with no turnaround, and leaves cancelled orders out', async () => {
    const response = await readDashboard(LABORATORY_PATH);
    const tests = response.body.data.breakdowns.tests as LaboratoryTest[];

    // Two released, one being run, one sent out; the cancelled CBC does not count.
    expect(tests.map((row) => row.labTestId)).toEqual(testIds);
    expect(tests[1]).toMatchObject({ orders: 4, releasedOrders: 2 });
  });

  it('splits the orders by outcome and source, sent-out orders apart', async () => {
    const response = await readDashboard(LABORATORY_PATH);

    expect(response.body.data.totals).toMatchObject({
      orders: 13,
      released: 10,
      inProgress: 1,
      sentOut: 1,
      cancelled: 1,
      medianTurnaroundMinutes: 45,
      recollectedOrders: 1,
      // One of the twelve orders run here, and one of all thirteen.
      recollectionRatePercent: 8.3,
      cancellationRatePercent: 7.7,
    });
    expect(response.body.data.breakdowns.sources).toEqual([
      { source: 'ENCOUNTER', orders: 10 },
      { source: 'WALK_IN', orders: 2 },
      { source: 'EXTERNAL_REFERRAL', orders: 1 },
    ]);
  });

  it('narrows by the ordering clinician, which a walk-in has none of', async () => {
    const response = await readDashboard(LABORATORY_PATH, { doctorId });

    expect(response.body.data.totals.orders).toBe(10);
  });

  it('given a lab technician, then laboratory analytics opens and finance analytics does not', async () => {
    mockActor('LAB_TECHNICIAN');

    const laboratory = await readDashboard(LABORATORY_PATH, { payerType: 'GENERAL' });
    const finance = await readDashboard(FINANCE_PATH, { payerType: 'GENERAL' });

    expect(laboratory.status).toBe(200);
    expect(finance.status).toBe(403);
  });

  it('refuses with FEATURE_DISABLED when the laboratory module is off', async () => {
    featureAvailabilityCacheMock.isEnabled.mockImplementation(async (key) => key !== 'laboratory');

    const response = await readDashboard(LABORATORY_PATH);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('carries no patient identifier and no order number', async () => {
    const response = await readDashboard(LABORATORY_PATH);
    const body = JSON.stringify(response.body);

    expect(body).not.toContain(patientId);
    expect(body).not.toContain(`MRN-${suffix}`);
    expect(body).not.toContain(`LAB-${suffix}`);
  });
});
