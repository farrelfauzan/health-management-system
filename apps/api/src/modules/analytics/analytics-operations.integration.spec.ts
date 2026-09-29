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
const AUGUST_VISITS = 120;
const SEPTEMBER_VISITS = 150;
const WHATSAPP_COMPLETED = 30;
const WHATSAPP_NO_SHOWS = 10;
const WHATSAPP_BOOKINGS = WHATSAPP_COMPLETED + WHATSAPP_NO_SHOWS;
const SEPTEMBER_BPJS_VISITS = 30;
const SEPTEMBER_INSURED_VISITS = 10;
const SEPTEMBER = { from: '2031-09-01', to: '2031-09-30', compare: 'true' };
const OPERATIONS_PERMISSIONS = [
  { action: 'read-operations', resource: 'Analytics', scope: 'ANY' as const },
];

/**
 * P29-T04 acceptance against a real PostgreSQL: the SQL, the clinic-day
 * cut, the comparison period and the payload's contents, through the wired
 * stack. The rows live in August and September 2031 under a poli made for
 * this spec, and every request filters by that poli, so rows from other
 * specs (or a developer's database) cannot reach the counts.
 */
describe('Analytics operations against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = `p29t04-${randomUUID().slice(0, 8)}`;
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientIds = Array.from({ length: SEPTEMBER_VISITS }, () => randomUUID());
  const registrationIds: string[] = [];
  const appointmentIds: string[] = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn(async () => true) };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function atJakarta(date: string): Date {
    return new Date(`${date}T09:00:00+07:00`);
  }

  function dayOf(month: string, index: number): string {
    return `${month}-${String((index % 28) + 1).padStart(2, '0')}`;
  }

  async function seedClinic(): Promise<void> {
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli Umum ${suffix}` } });
    await prisma.doctorProfile.create({
      data: {
        id: doctorId,
        licenseNumber: `LIC-${suffix}`,
        fullName: 'dr. Spec Analytics',
        specialtyId,
      },
    });
    await prisma.patientProfile.createMany({
      data: patientIds.map((id, index) => ({
        id,
        mrn: `MRN-${suffix}-${index}`,
        fullName: `Spec Patient ${suffix} ${index}`,
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE' as const,
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      })),
    });
  }

  async function seedWhatsappAppointments(): Promise<void> {
    const rows = Array.from({ length: WHATSAPP_COMPLETED + WHATSAPP_NO_SHOWS }, (_, index) => ({
      id: randomUUID(),
      patientId: patientIds[index] as string,
      doctorId,
      bookingSource: 'WHATSAPP' as const,
      scheduledAt: atJakarta(dayOf('2031-09', index)),
      status: index < WHATSAPP_COMPLETED ? ('COMPLETED' as const) : ('NO_SHOW' as const),
    }));
    await prisma.appointment.createMany({ data: rows });
    appointmentIds.push(...rows.map((row) => row.id));
  }

  /** September's first 30 visits are BPJS, the next 10 insured, the rest unrecorded. */
  function resolveSeptemberPayer(index: number): 'BPJS' | 'INSURANCE' | null {
    if (index < SEPTEMBER_BPJS_VISITS) {
      return 'BPJS';
    }
    return index < SEPTEMBER_BPJS_VISITS + SEPTEMBER_INSURED_VISITS ? 'INSURANCE' : null;
  }

  /**
   * Patients 0–119 visit in August; all 150 in September, so 30 are new.
   * The 30 completed WhatsApp bookings are 30 of September's visits; the
   * rest walk in. One extra September registration is cancelled.
   */
  async function seedVisits(): Promise<void> {
    const august = patientIds.slice(0, AUGUST_VISITS).map((patientId, index) => ({
      patientId,
      registeredAt: atJakarta(dayOf('2031-08', index)),
      appointmentId: null as string | null,
    }));
    const september = patientIds.map((patientId, index) => ({
      patientId,
      registeredAt: atJakarta(dayOf('2031-09', index)),
      appointmentId: index < WHATSAPP_COMPLETED ? (appointmentIds[index] as string) : null,
      payerType: resolveSeptemberPayer(index),
    }));
    const visits = [...august, ...september].map((visit, index) => ({
      id: randomUUID(),
      ...visit,
      specialtyId,
      poliQueueNumber: index + 1,
      status: 'COMPLETED' as const,
    }));
    const cancelled = {
      id: randomUUID(),
      patientId: patientIds[0] as string,
      registeredAt: atJakarta('2031-09-10'),
      appointmentId: null,
      specialtyId,
      poliQueueNumber: visits.length + 1,
      status: 'CANCELLED' as const,
    };
    await prisma.registration.createMany({ data: [...visits, cancelled] });
    registrationIds.push(...visits.map((visit) => visit.id), cancelled.id);
    await prisma.encounter.createMany({
      data: visits.map((visit) => ({
        registrationId: visit.id,
        patientId: visit.patientId,
        doctorId,
        status: 'FINISHED' as const,
        startedAt: visit.registeredAt,
      })),
    });
  }

  async function readOperations(query: Record<string, string>): Promise<request.Response> {
    const token = await jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
    return request(app.getHttpServer())
      .get(OPERATIONS_PATH)
      .query({ ...query, specialtyId })
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
    await seedWhatsappAppointments();
    await seedVisits();
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
    await prisma.encounter.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given 120 visits in August and 150 in September, then September shows 150 against 120', async () => {
    const response = await readOperations({
      from: '2031-09-01',
      to: '2031-09-30',
      compare: 'true',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({
      visits: SEPTEMBER_VISITS,
      newPatients: SEPTEMBER_VISITS - AUGUST_VISITS,
      returningPatients: AUGUST_VISITS,
      walkIns: SEPTEMBER_VISITS - WHATSAPP_COMPLETED,
    });
    expect(response.body.data.breakdowns.visitsByPoli).toEqual([
      {
        specialtyId,
        specialtyName: `Poli Umum ${suffix}`,
        visits: SEPTEMBER_VISITS,
        previousVisits: AUGUST_VISITS,
      },
    ]);
    expect(response.body.data.breakdowns.visitsByDoctor).toEqual([
      {
        doctorId,
        doctorName: 'dr. Spec Analytics',
        visits: SEPTEMBER_VISITS,
        previousVisits: AUGUST_VISITS,
      },
    ]);
    expect(response.body.data.comparison.totals.visits).toBe(AUGUST_VISITS);
  });

  it('given a BPJS payer filter, then only BPJS visits count and appointment outcomes stay whole', async () => {
    const response = await readOperations({ ...SEPTEMBER, payerType: 'BPJS' });

    expect(response.status).toBe(200);
    expect(response.body.data.totals.visits).toBe(SEPTEMBER_BPJS_VISITS);
    expect(response.body.data.comparison.totals.visits).toBe(0);
    expect(response.body.data.totals.appointments).toBe(WHATSAPP_BOOKINGS);
  });

  it('given an insurance payer filter, then an unrecorded payer matches neither', async () => {
    const response = await readOperations({ ...SEPTEMBER, payerType: 'INSURANCE' });

    expect(response.body.data.totals.visits).toBe(SEPTEMBER_INSURED_VISITS);
  });

  it('given a cancelled registration, then it is not counted', async () => {
    const response = await readOperations({ from: '2031-09-10', to: '2031-09-10' });

    const expectedVisitsOnTheTenth = Array.from({ length: SEPTEMBER_VISITS }, (_, index) =>
      dayOf('2031-09', index),
    ).filter((day) => day === '2031-09-10').length;
    expect(response.body.data.totals.visits).toBe(expectedVisitsOnTheTenth);
  });

  it('given 40 WhatsApp bookings with 30 completed and 10 no-shows, then WhatsApp shows 25%', async () => {
    const response = await readOperations({ from: '2031-09-01', to: '2031-09-30' });

    expect(
      response.body.data.breakdowns.bookingChannels.find(
        (row: { channel: string }) => row.channel === 'WHATSAPP',
      ),
    ).toEqual({
      channel: 'WHATSAPP',
      bookings: 40,
      completed: 30,
      noShows: 10,
      noShowRatePercent: 25,
    });
    expect(response.body.data.totals.noShowRatePercent).toBe(25);
  });

  it('puts every visit on its clinic day and sums the series to the total', async () => {
    const response = await readOperations({ from: '2031-09-01', to: '2031-09-30' });
    const series: Array<{ bucket: string; visits: number }> = response.body.data.series;

    expect(series).toHaveLength(30);
    expect(series.reduce((total, point) => total + point.visits, 0)).toBe(SEPTEMBER_VISITS);
    expect(series.find((point) => point.bucket === '2031-09-29')?.visits).toBe(0);
  });

  it('carries no patient identifier anywhere in the payload', async () => {
    const response = await readOperations({
      from: '2031-09-01',
      to: '2031-09-30',
      compare: 'true',
    });
    const payload = JSON.stringify(response.body);

    patientIds.forEach((patientId) => expect(payload).not.toContain(patientId));
    expect(payload).not.toContain(`MRN-${suffix}`);
    expect(payload).not.toContain('Spec Patient');
  });
});
