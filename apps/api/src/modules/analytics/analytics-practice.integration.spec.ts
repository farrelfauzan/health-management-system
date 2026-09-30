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

const PRACTICE_PATH = '/api/v1/v1/analytics/my-practice';
const DAY = '2031-11-12';
const STARTED_AT = new Date(`${DAY}T09:00:00+07:00`);
const MINUTE_MS = 60_000;
const PRACTICE_PERMISSION = {
  action: 'read-practice',
  resource: 'Analytics',
  scope: 'OWN' as const,
};

type Clinician = {
  userId: string;
  doctorId: string;
  profession: 'DOCTOR' | 'MIDWIFE';
  encounters: number;
};

/**
 * P29-T15 against a real PostgreSQL. On 12 November 2031 a doctor finished
 * 60 encounters (40 coded with one code, 20 uncoded, 10 to 19 minutes long),
 * a colleague 80, and a midwife 5. The doctor had 8 appointments kept and 2
 * missed. Every clinician owns a user, and the practice is read as that user.
 */
describe('Analytics my practice against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const specialtyId = randomUUID();
  const patientId = randomUUID();
  const codeId = randomUUID();
  const code = `J9${suffix}`;
  const clinicians: Record<'me' | 'colleague' | 'midwife', Clinician> = {
    me: { userId: randomUUID(), doctorId: randomUUID(), profession: 'DOCTOR', encounters: 60 },
    colleague: {
      userId: randomUUID(),
      doctorId: randomUUID(),
      profession: 'DOCTOR',
      encounters: 80,
    },
    midwife: { userId: randomUUID(), doctorId: randomUUID(), profession: 'MIDWIFE', encounters: 5 },
  };
  const registrationIds: string[] = [];
  const encounterIds: string[] = [];
  let queueNumber = 0;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn(async () => true) };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  async function readPracticeAs(
    clinician: Clinician,
    roleCode: string,
    query: Record<string, string> = {},
  ): Promise<request.Response> {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: clinician.userId,
      roles: [{ role: { code: roleCode, permissions: [{ permission: PRACTICE_PERMISSION }] } }],
    });
    const token = await jwtService.signAsync(
      { sub: clinician.userId, email: `${clinician.userId}@example.test` },
      { secret: 'dev-access-secret' },
    );
    return request(app.getHttpServer())
      .get(PRACTICE_PATH)
      .query({ from: DAY, to: DAY, ...query })
      .set('Authorization', `Bearer ${token}`);
  }

  async function seedClinician(key: string, clinician: Clinician): Promise<void> {
    await prisma.user.create({
      data: {
        id: clinician.userId,
        email: `${key}-${suffix}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: key,
      },
    });
    await prisma.doctorProfile.create({
      data: {
        id: clinician.doctorId,
        licenseNumber: `LIC-${key}-${suffix}`,
        fullName: `Klinisi ${key}`,
        specialtyId,
        profession: clinician.profession,
        ownerUserId: clinician.userId,
      },
    });
  }

  async function seedEncounters(clinician: Clinician, codedCount: number): Promise<void> {
    const rows = Array.from({ length: clinician.encounters }, (_, index) => {
      queueNumber += 1;
      return {
        registrationId: randomUUID(),
        encounterId: randomUUID(),
        queueNumber,
        minutes: 10 + (index % 10),
        isCoded: index < codedCount,
      };
    });
    await prisma.registration.createMany({
      data: rows.map((row) => ({
        id: row.registrationId,
        patientId,
        specialtyId,
        poliQueueNumber: row.queueNumber,
        status: 'COMPLETED' as const,
        registeredAt: STARTED_AT,
        checkedInAt: STARTED_AT,
      })),
    });
    await prisma.encounter.createMany({
      data: rows.map((row) => ({
        id: row.encounterId,
        registrationId: row.registrationId,
        patientId,
        doctorId: clinician.doctorId,
        status: 'FINISHED' as const,
        startedAt: STARTED_AT,
        endedAt: new Date(STARTED_AT.getTime() + row.minutes * MINUTE_MS),
      })),
    });
    await prisma.diagnosis.createMany({
      data: rows
        .filter((row) => row.isCoded)
        .map((row) => ({
          encounterId: row.encounterId,
          icd10CodeId: codeId,
          code,
          display: 'Kode uji',
          type: 'PRIMARY' as const,
        })),
    });
    registrationIds.push(...rows.map((row) => row.registrationId));
    encounterIds.push(...rows.map((row) => row.encounterId));
  }

  async function seedAppointments(): Promise<void> {
    const statuses = [...Array(8).fill('COMPLETED'), 'NO_SHOW', 'NO_SHOW'] as const;
    await prisma.appointment.createMany({
      data: statuses.map((status) => ({
        patientId,
        doctorId: clinicians.me.doctorId,
        type: 'SESSION' as const,
        scheduledAt: STARTED_AT,
        status,
      })),
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
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Praktik',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    await prisma.icd10Code.create({ data: { id: codeId, code, display: 'Kode uji' } });
    for (const [key, clinician] of Object.entries(clinicians)) {
      await seedClinician(key, clinician);
    }
    await seedEncounters(clinicians.me, 40);
    await seedEncounters(clinicians.colleague, 80);
    await seedEncounters(clinicians.midwife, 0);
    await seedAppointments();
  });

  afterAll(async () => {
    const doctorIds = Object.values(clinicians).map((clinician) => clinician.doctorId);
    await prisma.appointment.deleteMany({ where: { doctorId: { in: doctorIds } } });
    await prisma.diagnosis.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.icd10Code.deleteMany({ where: { id: codeId } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: doctorIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(clinicians).map((clinician) => clinician.userId) } },
    });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given I finished 60 encounters and a colleague 80, then I see 60 and nothing about the colleague', async () => {
    const response = await readPracticeAs(clinicians.me, 'DOCTOR');
    const body = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body.data.totals).toMatchObject({
      finishedEncounters: 60,
      // Lengths 10 to 19 minutes, six of each.
      medianConsultMinutes: 15,
      completedAppointments: 8,
      noShowAppointments: 2,
      noShowRatePercent: 20,
    });
    expect(response.body.data.breakdowns).toEqual({
      topDiagnoses: [{ code, name: 'Kode uji', count: 40 }],
      codedEncounters: 40,
    });
    expect(body).not.toContain(clinicians.colleague.doctorId);
    expect(body).not.toContain('Klinisi colleague');
  });

  it('given ?doctorId=<other>, then my own data is returned', async () => {
    const response = await readPracticeAs(clinicians.me, 'DOCTOR', {
      doctorId: clinicians.colleague.doctorId,
      specialtyId,
      payerType: 'BPJS',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.totals.finishedEncounters).toBe(60);
  });

  it('never serves one clinician the answer cached for another', async () => {
    await readPracticeAs(clinicians.me, 'DOCTOR');

    const colleague = await readPracticeAs(clinicians.colleague, 'DOCTOR');

    expect(colleague.body.data.totals.finishedEncounters).toBe(80);
  });

  it('given a MIDWIFE, the same page works for her encounters', async () => {
    const response = await readPracticeAs(clinicians.midwife, 'MIDWIFE');

    expect(response.status).toBe(200);
    expect(response.body.data.totals.finishedEncounters).toBe(5);
    expect(response.body.data.breakdowns.topDiagnoses).toEqual([]);
  });

  it('refuses a user who holds the grant but has no clinician profile', async () => {
    const stranger: Clinician = {
      userId: randomUUID(),
      doctorId: randomUUID(),
      profession: 'DOCTOR',
      encounters: 0,
    };

    const response = await readPracticeAs(stranger, 'DOCTOR');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ANALYTICS_NO_CLINICIAN_PROFILE');
  });
});
