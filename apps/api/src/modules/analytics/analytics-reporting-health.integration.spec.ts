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

const REPORTING_PATH = '/api/v1/v1/analytics/reporting-health';
const FAILED_SUBMISSIONS = 3;
const FINISHED_VISITS = 4;
const FAILURE_TEXT = 'Patient Spec Reporting rejected: NIK 3201999999990001';
const OPERATIONS_PERMISSIONS = [
  { action: 'read-operations', resource: 'Analytics', scope: 'ANY' as const },
];

type SatusehatRow = { kind: string; failed: number };

/**
 * P29-T06 acceptance against a real PostgreSQL. Pending and failed counts are
 * the whole queue's, not a range's, so the spec compares the count before and
 * after seeding instead of expecting an absolute number another spec's rows
 * could move. The readiness counts are the range's, so they sit in 2031.
 */
describe('Analytics reporting health against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = `p29t06-${randomUUID().slice(0, 8)}`;
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const registrationIds: string[] = [];
  const encounterIds: string[] = [];
  const submissionIds: string[] = [];
  const enabledFeatures = new Set<string>(['analytics']);

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn(async (key: string) => enabledFeatures.has(key)),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  async function readReportingHealth(from: string, to: string): Promise<request.Response> {
    const token = await jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
    return request(app.getHttpServer())
      .get(REPORTING_PATH)
      .query({ from, to })
      .set('Authorization', `Bearer ${token}`);
  }

  function countFailedEncounters(response: request.Response): number {
    const rows: SatusehatRow[] = response.body.data.satusehat;
    return rows.find((row) => row.kind === 'ENCOUNTER')?.failed ?? 0;
  }

  async function seedFinishedVisits(): Promise<void> {
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.create({
      data: {
        id: doctorId,
        licenseNumber: `LIC-${suffix}`,
        fullName: 'dr. Spec Reporting',
        specialtyId,
      },
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Spec Reporting',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    for (let index = 0; index < FINISHED_VISITS; index += 1) {
      const registration = await prisma.registration.create({
        data: { patientId, specialtyId, poliQueueNumber: index + 1, status: 'COMPLETED' },
      });
      const encounter = await prisma.encounter.create({
        data: {
          registrationId: registration.id,
          patientId,
          doctorId,
          status: 'FINISHED',
          startedAt: new Date(`2031-09-1${index}T09:00:00+07:00`),
        },
      });
      registrationIds.push(registration.id);
      encounterIds.push(encounter.id);
    }
  }

  async function seedFailedSubmissions(): Promise<void> {
    const rows = encounterIds.slice(0, FAILED_SUBMISSIONS).map((encounterId) => ({
      id: randomUUID(),
      encounterId,
      kind: 'ENCOUNTER' as const,
      status: 'FAILED' as const,
      attempts: 3,
      lastError: FAILURE_TEXT,
      nextAttemptAt: new Date(),
    }));
    await prisma.satusehatSubmission.createMany({ data: rows });
    submissionIds.push(...rows.map((row) => row.id));
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
    await seedFinishedVisits();
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
    await prisma.satusehatSubmission.deleteMany({ where: { id: { in: submissionIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given 3 failed encounter submissions, then the page counts 3 more failures, with no error text', async () => {
    // Different ranges, so the five-minute cache cannot answer the second read.
    const before = await readReportingHealth('2031-01-01', '2031-01-31');
    await seedFailedSubmissions();

    const after = await readReportingHealth('2031-02-01', '2031-02-28');

    expect(after.status).toBe(200);
    expect(countFailedEncounters(after) - countFailedEncounters(before)).toBe(FAILED_SUBMISSIONS);
    expect(JSON.stringify(after.body)).not.toContain('Patient Spec Reporting');
    expect(JSON.stringify(after.body)).not.toContain('3201999999990001');
  });

  it('counts the range finished visits with no primary diagnosis and a clinician without a NIK', async () => {
    const response = await readReportingHealth('2031-09-01', '2031-09-30');

    expect(response.body.data.readiness).toEqual({
      encountersWithoutPrimaryDiagnosis: FINISHED_VISITS,
      encountersWithUnlinkedClinician: FINISHED_VISITS,
    });
  });

  it('given BPJS keys off, then the BPJS block is absent', async () => {
    const response = await readReportingHealth('2031-03-01', '2031-03-31');

    expect(response.body.data.bpjs).toBeNull();
  });

  it('given a BPJS key on, then the BPJS block is a list', async () => {
    enabledFeatures.add('bpjs-pcare');

    const response = await readReportingHealth('2031-04-01', '2031-04-30');

    expect(Array.isArray(response.body.data.bpjs)).toBe(true);
    enabledFeatures.delete('bpjs-pcare');
  });
});
