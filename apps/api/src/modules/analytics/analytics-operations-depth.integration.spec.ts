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

const OPERATIONS_PATH = '/api/v1/v1/analytics/operations';
const OPERATIONS_PERMISSIONS = [
  { action: 'read-operations', resource: 'Analytics', scope: 'ANY' as const },
];
// 1 October 2031 is a Wednesday: ISO weekday 3.
const VISIT_DAY = '2031-10-01';
const WEDNESDAY = 3;

type VisitTiming = {
  checkIn: string;
  start: string;
  end: string;
};

/**
 * P29-T11 acceptance against a real PostgreSQL: wait and consult times with
 * the 8-hour exclusion, busiest hours, session utilisation, and the
 * inpatient block following the rooms feature. Rows sit on 1 October 2031
 * under a poli made for this spec, and every request filters by it.
 */
describe('Analytics operations depth against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = `p29t11-${randomUUID().slice(0, 8)}`;
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const sessionId = randomUUID();
  const admissionId = randomUUID();
  const registrationIds: string[] = [];
  const appointmentIds: string[] = [];
  const enabledFeatures = new Set<string>(['analytics']);

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn(async (key: string) => enabledFeatures.has(key)),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  // Waits of 20 and 40 minutes, and one check-in whose examination starts
  // 9 h 10 min later: a clock left running, not a wait.
  const VISITS: readonly VisitTiming[] = [
    { checkIn: '09:00', start: '09:20', end: '09:30' },
    { checkIn: '09:00', start: '09:40', end: '10:00' },
    { checkIn: '09:00', start: '18:10', end: '18:25' },
  ];

  function atJakarta(time: string, day: string = VISIT_DAY): Date {
    return new Date(`${day}T${time}:00+07:00`);
  }

  async function seedClinic(): Promise<void> {
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.create({
      data: {
        id: doctorId,
        licenseNumber: `LIC-${suffix}`,
        fullName: 'dr. Spec Depth',
        specialtyId,
      },
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Spec Depth',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
  }

  async function seedVisits(): Promise<void> {
    for (const [index, visit] of VISITS.entries()) {
      const registration = await prisma.registration.create({
        data: {
          patientId,
          specialtyId,
          poliQueueNumber: index + 1,
          status: 'COMPLETED',
          registeredAt: atJakarta(visit.checkIn),
          checkedInAt: atJakarta(visit.checkIn),
        },
      });
      registrationIds.push(registration.id);
      await prisma.encounter.create({
        data: {
          registrationId: registration.id,
          patientId,
          doctorId,
          status: 'FINISHED',
          startedAt: atJakarta(visit.start),
          endedAt: atJakarta(visit.end),
        },
      });
    }
  }

  /** A session capped at 10 with 3 bookings and one cancellation: 30% full. */
  async function seedSession(): Promise<void> {
    await prisma.appointmentSession.create({
      data: {
        id: sessionId,
        doctorId,
        sessionDate: new Date(`${VISIT_DAY}T00:00:00.000Z`),
        startTime: '08:00',
        endTime: '12:00',
        maxPatients: 10,
        status: 'OPEN',
      },
    });
    const statuses = ['COMPLETED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const;
    const rows = statuses.map((status, index) => ({
      id: randomUUID(),
      patientId,
      doctorId,
      sessionId,
      queueNumber: index + 1,
      scheduledAt: atJakarta('08:30'),
      status,
    }));
    await prisma.appointment.createMany({ data: rows });
    appointmentIds.push(...rows.map((row) => row.id));
  }

  /** One admission from 1 to 3 October, sent home: two days' stay. */
  async function seedAdmission(): Promise<void> {
    await prisma.admission.create({
      data: {
        id: admissionId,
        patientId,
        admittingDoctorId: doctorId,
        status: 'DISCHARGED',
        admittedAt: atJakarta('10:00'),
        dischargedAt: atJakarta('10:00', '2031-10-03'),
        dischargeDisposition: 'HOME',
      },
    });
  }

  async function readOperations(): Promise<request.Response> {
    const token = await jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
    return request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query({ from: '2031-10-01', to: '2031-10-10', specialtyId })
      .set('Authorization', `Bearer ${token}`);
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
    await seedVisits();
    await seedSession();
    await seedAdmission();
  });

  beforeEach(() => {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: OPERATIONS_PERMISSIONS.map((permission) => ({ permission })),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.admission.deleteMany({ where: { id: admissionId } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.appointmentSession.deleteMany({ where: { id: sessionId } });
    await prisma.encounter.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given a check-in whose examination starts 9 h later, excludes it from the wait and counts it', async () => {
    const response = await readOperations();

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({
      medianWaitMinutes: 30,
      p90WaitMinutes: 38,
      excludedWaitIntervals: 1,
      medianConsultMinutes: 15,
      p90ConsultMinutes: 19,
      excludedConsultIntervals: 0,
    });
  });

  it('puts the three check-ins on Wednesday at 09:00 clinic time', async () => {
    const response = await readOperations();

    expect(response.body.data.breakdowns.busiestHours).toEqual([
      { weekday: WEDNESDAY, hour: 9, checkIns: 3 },
    ]);
  });

  it('counts a session capped at 10 with 3 bookings as 30% full, leaving the cancellation out', async () => {
    const response = await readOperations();

    expect(response.body.data.totals.sessionUtilisationPercent).toBe(30);
    expect(response.body.data.breakdowns.sessions).toMatchObject({
      cappedSessions: 1,
      capacity: 10,
      bookedAppointments: 3,
    });
  });

  it('given room-management off, then the inpatient block is absent', async () => {
    enabledFeatures.delete('room-management');

    const response = await readOperations();

    expect(response.body.data.totals.inpatient).toBeNull();
    expect(response.body.data.breakdowns.inpatientDispositions).toBeNull();
  });

  it('given room-management on, then admissions, discharges, length of stay and disposition show', async () => {
    enabledFeatures.add('room-management');

    const response = await readOperations();

    expect(response.body.data.totals.inpatient).toMatchObject({
      admissions: 1,
      discharges: 1,
      averageLengthOfStayDays: 2,
    });
    expect(response.body.data.breakdowns.inpatientDispositions).toEqual([
      { disposition: 'HOME', discharges: 1 },
    ]);
    enabledFeatures.delete('room-management');
  });
});
