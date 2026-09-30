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

const CASE_MIX_PATH = '/api/v1/v1/analytics/case-mix';
const DAY = '2031-11-12';
const CLINICAL_PERMISSIONS = [
  { action: 'read-clinical', resource: 'Analytics', scope: 'ANY' as const },
  { action: 'read', resource: 'Encounter', scope: 'ANY' as const },
];

type SeededEncounter = {
  codeIndex: number | null;
  hasPrimary: boolean;
  status: 'FINISHED' | 'CANCELLED';
  procedureIndex?: number;
};

/**
 * P29-T12 against a real PostgreSQL. 300 finished encounters on 12 November
 * 2031 under a poli made for this spec: 84 with the first code, then 63, 60,
 * 60 and 3 with four more, and 30 without a coded primary diagnosis (10 with
 * none, 20 typed as free text). One cancelled encounter never counts. Codes
 * are made for the spec too, so a seeded catalog cannot collide with them.
 */
describe('Analytics case mix against PostgreSQL', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientId = randomUUID();
  const codeIds = Array.from({ length: 5 }, () => randomUUID());
  const codes = codeIds.map((_, index) => `J${index}${suffix}`);
  const procedureCodeIds = [randomUUID(), randomUUID()];
  const procedureCodes = procedureCodeIds.map((_, index) => `P${index}${suffix}`);
  const registrationIds: string[] = [];
  const encounterIds: string[] = [];

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const featureAvailabilityCacheMock = { isEnabled: jest.fn(async () => true) };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  function buildEncounters(): SeededEncounter[] {
    const counts = [84, 63, 60, 60, 3];
    const coded = counts.flatMap((count, codeIndex) =>
      Array.from({ length: count }, (_, index) => ({
        codeIndex,
        hasPrimary: true,
        status: 'FINISHED' as const,
        // Six procedures of one code and two of another: both small or paired.
        ...(codeIndex === 0 && index < 6 ? { procedureIndex: 0 } : {}),
        ...(codeIndex === 1 && index < 2 ? { procedureIndex: 1 } : {}),
      })),
    );
    const uncoded = [
      ...Array.from({ length: 10 }, () => ({
        codeIndex: null,
        hasPrimary: false,
        status: 'FINISHED' as const,
      })),
      ...Array.from({ length: 20 }, () => ({
        codeIndex: null,
        hasPrimary: true,
        status: 'FINISHED' as const,
      })),
    ];
    const cancelled = { codeIndex: 0, hasPrimary: true, status: 'CANCELLED' as const };
    return [...coded, ...uncoded, cancelled];
  }

  async function seedCatalog(): Promise<void> {
    await prisma.icd10Code.createMany({
      data: codeIds.map((id, index) => ({
        id,
        code: codes[index] as string,
        display: `Kode uji ${index}`,
      })),
    });
    await prisma.icd9cmCode.createMany({
      data: procedureCodeIds.map((id, index) => ({
        id,
        code: procedureCodes[index] as string,
        display: `Tindakan uji ${index}`,
      })),
    });
  }

  async function seedEncounters(): Promise<void> {
    const at = new Date(`${DAY}T09:00:00+07:00`);
    const seeded = buildEncounters().map((encounter, index) => ({
      ...encounter,
      registrationId: randomUUID(),
      encounterId: randomUUID(),
      poliQueueNumber: index + 1,
    }));
    await prisma.registration.createMany({
      data: seeded.map((row) => ({
        id: row.registrationId,
        patientId,
        specialtyId,
        poliQueueNumber: row.poliQueueNumber,
        status: 'COMPLETED' as const,
        registeredAt: at,
        checkedInAt: at,
      })),
    });
    await prisma.encounter.createMany({
      data: seeded.map((row) => ({
        id: row.encounterId,
        registrationId: row.registrationId,
        patientId,
        doctorId,
        status: row.status,
        startedAt: at,
      })),
    });
    await prisma.diagnosis.createMany({
      data: seeded
        .filter((row) => row.hasPrimary)
        .map((row) => ({
          encounterId: row.encounterId,
          icd10CodeId: row.codeIndex === null ? null : codeIds[row.codeIndex],
          code: row.codeIndex === null ? 'FREE' : (codes[row.codeIndex] as string),
          display: row.codeIndex === null ? 'Ditulis bebas' : `Kode uji ${row.codeIndex}`,
          type: 'PRIMARY' as const,
        })),
    });
    await prisma.procedure.createMany({
      data: seeded
        .filter((row) => row.procedureIndex !== undefined)
        .map((row) => ({
          encounterId: row.encounterId,
          icd9cmCodeId: procedureCodeIds[row.procedureIndex as number],
          code: procedureCodes[row.procedureIndex as number] as string,
          display: 'Tindakan uji',
          performedAt: at,
        })),
    });
    registrationIds.push(...seeded.map((row) => row.registrationId));
    encounterIds.push(...seeded.map((row) => row.encounterId));
  }

  async function readCaseMix(): Promise<request.Response> {
    const token = await jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );
    return request(app.getHttpServer())
      .get(CASE_MIX_PATH)
      .query({ from: DAY, to: DAY, specialtyId })
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
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli ${suffix}` } });
    await prisma.doctorProfile.create({
      data: { id: doctorId, licenseNumber: `LIC-${suffix}`, fullName: 'dr. Pola', specialtyId },
    });
    await prisma.patientProfile.create({
      data: {
        id: patientId,
        mrn: `MRN-${suffix}`,
        fullName: 'Patient Pola',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      },
    });
    await seedCatalog();
    await seedEncounters();
  });

  beforeEach(() => {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: CLINICAL_PERMISSIONS.map((permission) => ({ permission })),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.procedure.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.diagnosis.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.icd10Code.deleteMany({ where: { id: { in: codeIds } } });
    await prisma.icd9cmCode.deleteMany({ where: { id: { in: procedureCodeIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await app.close();
  });

  it('given the top code on 84 of 300 finished encounters, then it shows 84 (28%)', async () => {
    const response = await readCaseMix();

    expect(response.status).toBe(200);
    expect(response.body.data.totals.finishedEncounters).toBe(300);
    expect(response.body.data.breakdowns.topDiagnoses[0]).toMatchObject({
      kind: 'CODE',
      code: codes[0],
      count: 84,
      sharePercent: 28,
    });
  });

  it('given a code with 3 encounters, then it shows "<5" and cannot be derived from the total', async () => {
    const response = await readCaseMix();
    const rows = response.body.data.breakdowns.topDiagnoses as Array<{
      kind: string;
      code: string | null;
      count: number | { suppressed: true };
      sharePercent: number | null;
    }>;
    const small = rows.find((row) => row.code === codes[4]);
    const uncoded = rows.find((row) => row.kind === 'UNCODED');

    expect(small).toMatchObject({ count: { suppressed: true }, sharePercent: null });
    // With only one row hidden, 300 minus the rest would give it back: the
    // next smallest is withheld with it.
    expect(uncoded).toMatchObject({ count: { suppressed: true }, sharePercent: null });
    expect(JSON.stringify(response.body)).not.toMatch(/"count":3[,}]/);
  });

  it('given 270 of 300 encounters coded, then completeness is 90% and the cancelled one is left out', async () => {
    const response = await readCaseMix();

    expect(response.body.data.totals).toMatchObject({
      finishedEncounters: 300,
      codedEncounters: 270,
      uncodedEncounters: 30,
      codingCompletenessPercent: 90,
      distinctCodes: 5,
    });
  });

  it('withholds a pair of small procedure counts together', async () => {
    const response = await readCaseMix();

    expect(response.body.data.breakdowns.topProcedures).toEqual([
      expect.objectContaining({ code: procedureCodes[0], count: { suppressed: true } }),
      expect.objectContaining({ code: procedureCodes[1], count: { suppressed: true } }),
    ]);
  });

  it('opens the encounter list on exactly the uncoded encounters the card counts', async () => {
    const token = await jwtService.signAsync(
      { sub: 'admin-user', email: 'admin@hms.local' },
      { secret: 'dev-access-secret' },
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/encounters')
      .query({ status: 'FINISHED', doctorId, startedFrom: DAY, startedTo: DAY, uncoded: 'true' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(30);
  });

  it('carries no patient identifier and no encounter id', async () => {
    const response = await readCaseMix();
    const body = JSON.stringify(response.body);

    expect(body).not.toContain(patientId);
    expect(encounterIds.some((id) => body.includes(id))).toBe(false);
    expect(body).not.toContain(`MRN-${suffix}`);
  });
});
