import { randomUUID } from 'node:crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

// Booting the whole AppModule against a real database can take longer than
// jest's 5 s default on a busy runner.
const SUITE_TIMEOUT_MS = 120_000;

jest.setTimeout(SUITE_TIMEOUT_MS);

/**
 * P25-T16 (SJ-239) against real Postgres, over the public routes.
 *
 * Given a month of care for two BPJS mothers and one mother without a BPJS
 * number — ANC, a pra rujukan, a birth, a nifas visit and an IUD — the recap
 * lists one line per payable unit for the BPJS mothers only, at the seeded-
 * shape tariffs; marking a line twice writes one mark and one audit row; and
 * the routes answer 403 without `bpjs.non-capitation.*`. The month is far in
 * the future so no other fixture on a shared database can fall into it.
 */
describe('BPJS non-capitation recap (P25-T16)', () => {
  const RUN_SUFFIX = Date.now().toString(36).toUpperCase();
  const TEST_MARKER = `e2e-noncap-${RUN_SUFFIX}`;
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = randomUUID();
  const OUTSIDER_USER_ID = randomUUID();
  const READER_USER_ID = randomUUID();
  const ADMIN_ROLE_CODE = `E2E_NONCAP_ADMIN_${RUN_SUFFIX}`;
  const READER_ROLE_CODE = `E2E_NONCAP_READER_${RUN_SUFFIX}`;
  const MONTH = '2031-10';
  const RECAP_PATH = '/api/v1/bpjs/non-capitation/recap';
  const MARKS_PATH = '/api/v1/bpjs/non-capitation/marks';
  const TARIFF_VALID_FROM = new Date('2031-01-01T00:00:00.000Z');

  const PERMISSIONS = [
    ['bpjs.non-capitation.read:any', 'BpjsNonCapitation', 'read'],
    ['bpjs.non-capitation.write:any', 'BpjsNonCapitation', 'write'],
  ] as const;

  const pdfRendererMock = {
    render: jest.fn(async () => new Uint8Array(Buffer.from('%PDF-1.7 noncap'))),
  };

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let outsiderToken: string;
  let readerToken: string;
  let midwifeId: string;
  let specialtyId: string;
  const patientIds: string[] = [];
  const tariffIds: string[] = [];
  let savedSettings: Awaited<ReturnType<PrismaService['bpjsNonCapitationSettings']['findFirst']>> =
    null;
  let antenatalVisitId: string;

  function asUser(token: string, method: 'get' | 'post' | 'put', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
  }

  async function seedUser(
    userId: string,
    roleCode: string | null,
    keys: readonly string[],
  ): Promise<void> {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${TEST_MARKER}-${userId}@example.test`,
        passwordHash: 'not-a-hash',
      },
    });
    if (roleCode === null) {
      return;
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: [...keys] } },
      select: { id: true },
    });
    const role = await prisma.role.create({
      data: { code: roleCode, name: roleCode, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async function seedActors(): Promise<void> {
    for (const [permissionKey, resource, action] of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey },
        update: {},
        create: { permissionKey, resource, action, scope: PermissionScope.ANY },
      });
    }
    await seedUser(
      ADMIN_USER_ID,
      ADMIN_ROLE_CODE,
      PERMISSIONS.map(([key]) => key),
    );
    await seedUser(READER_USER_ID, READER_ROLE_CODE, ['bpjs.non-capitation.read:any']);
    await seedUser(OUTSIDER_USER_ID, null, []);
  }

  async function createPatient(label: string, hasBpjsNumber: boolean): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `NC-${RUN_SUFFIX}-${label}`,
        fullName: `Ibu ${label}`,
        dateOfBirth: new Date('1995-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '+6281200000001',
        address: TEST_MARKER,
        ...(hasBpjsNumber
          ? {
              bpjsNumberCiphertext: `fixture-cipher-${label}`,
              bpjsNumberIndex: `fixture-index-${RUN_SUFFIX}-${label}`,
              bpjsNumberLast4: '4821',
              bpjsNumberKeyVersion: 1,
            }
          : {}),
      },
      select: { id: true },
    });
    patientIds.push(patient.id);
    return patient.id;
  }

  async function createEncounter(
    patientId: string,
    startedAt: Date,
    status: 'FINISHED' | 'IN_PROGRESS' = 'FINISHED',
  ): Promise<string> {
    const registration = await prisma.registration.create({
      data: { patientId, status: 'COMPLETED', checkedInAt: startedAt },
      select: { id: true },
    });
    const encounter = await prisma.encounter.create({
      data: { registrationId: registration.id, patientId, doctorId: midwifeId, status, startedAt },
      select: { id: true },
    });
    return encounter.id;
  }

  async function createEpisode(patientId: string, delivered: boolean): Promise<string> {
    const episode = await prisma.pregnancyEpisode.create({
      data: {
        patientId,
        status: delivered ? 'DELIVERED' : 'ACTIVE',
        ...(delivered
          ? { endReason: 'DELIVERY' as const, endedAt: new Date('2031-10-02T03:00:00+07:00') }
          : {}),
        estimatedDeliveryDate: new Date('2031-12-01T00:00:00.000Z'),
        eddSource: 'LMP',
        gravida: 1,
        para: 0,
        abortus: 0,
        createdById: ADMIN_USER_ID,
      },
      select: { id: true },
    });
    return episode.id;
  }

  async function createAntenatalVisit(params: {
    readonly patientId: string;
    readonly episodeId: string;
    readonly startedAt: Date;
    readonly status?: 'FINISHED' | 'IN_PROGRESS';
  }): Promise<{ visitId: string; encounterId: string }> {
    const encounterId = await createEncounter(params.patientId, params.startedAt, params.status);
    const visit = await prisma.antenatalVisit.create({
      data: { pregnancyEpisodeId: params.episodeId, encounterId, visitCode: 'K2' },
      select: { id: true },
    });
    return { visitId: visit.id, encounterId };
  }

  async function seedMonth(): Promise<void> {
    const specialty = await prisma.specialty.create({ data: { name: `${TEST_MARKER} KIA` } });
    specialtyId = specialty.id;
    const midwife = await prisma.doctorProfile.create({
      data: {
        fullName: 'Bidan Rekap',
        profession: 'MIDWIFE',
        licenseNumber: `${TEST_MARKER}-bidan`,
        specialtyId,
      },
    });
    midwifeId = midwife.id;
    const [motherA, motherB, motherWithoutBpjs] = [
      await createPatient('A', true),
      await createPatient('B', true),
      await createPatient('C', false),
    ];
    const episodeA = await createEpisode(motherA, false);
    const first = await createAntenatalVisit({
      patientId: motherA,
      episodeId: episodeA,
      startedAt: new Date('2031-10-14T09:00:00+07:00'),
    });
    antenatalVisitId = first.visitId;
    const referring = await createAntenatalVisit({
      patientId: motherA,
      episodeId: episodeA,
      startedAt: new Date('2031-10-28T09:00:00+07:00'),
    });
    await prisma.document.create({
      data: {
        ownerType: 'PATIENT',
        purpose: 'PATIENT_CLINICAL',
        title: 'Surat Rujukan',
        storageKey: `${TEST_MARKER}/rujukan.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 10,
        uploadedById: ADMIN_USER_ID,
        patientId: motherA,
        encounterId: referring.encounterId,
        category: 'REFERRAL_LETTER',
        documentDate: new Date('2031-10-28T00:00:00.000Z'),
      },
    });
    await createAntenatalVisit({
      patientId: motherA,
      episodeId: episodeA,
      startedAt: new Date('2031-10-30T09:00:00+07:00'),
      status: 'IN_PROGRESS',
    });
    const episodeC = await createEpisode(motherWithoutBpjs, false);
    await createAntenatalVisit({
      patientId: motherWithoutBpjs,
      episodeId: episodeC,
      startedAt: new Date('2031-10-15T09:00:00+07:00'),
    });
    const episodeB = await createEpisode(motherB, true);
    const delivery = await prisma.deliveryRecord.create({
      data: {
        pregnancyEpisodeId: episodeB,
        attendantDoctorId: midwifeId,
        birthAt: new Date('2031-10-02T03:00:00+07:00'),
        mode: 'SPONTANEOUS_VAGINAL',
        recordedById: ADMIN_USER_ID,
      },
      select: { id: true },
    });
    const nifasEncounterId = await createEncounter(motherB, new Date('2031-10-03T10:00:00+07:00'));
    await prisma.postnatalVisit.create({
      data: {
        encounterId: nifasEncounterId,
        subject: 'MOTHER',
        pregnancyEpisodeId: episodeB,
        visitCode: 'KF1',
      },
    });
    await prisma.familyPlanningRecord.create({
      data: {
        patientId: motherB,
        method: 'IUD',
        acceptorType: 'NEW',
        startedOn: new Date('2031-10-20T00:00:00.000Z'),
        providerDoctorId: midwifeId,
        deliveryRecordId: delivery.id,
      },
    });
  }

  async function seedTariffs(): Promise<void> {
    const rows = [
      ['ANTENATAL_MIDWIFE', 70000],
      ['PRE_REFERRAL', 200000],
      ['DELIVERY_HEALTH_WORKER_TEAM', 800000],
      ['POSTNATAL_MOTHER_NEWBORN', 50000],
      ['FAMILY_PLANNING_IUD', 105000],
    ] as const;
    for (const [serviceType, amount] of rows) {
      const existing = await prisma.bpjsNonCapitationTariff.findFirst({
        where: { serviceType, validFrom: TARIFF_VALID_FROM },
      });
      if (existing !== null) {
        continue;
      }
      const created = await prisma.bpjsNonCapitationTariff.create({
        data: {
          serviceType,
          amount,
          validFrom: TARIFF_VALID_FROM,
          regulationReference: `Permenkes 3/2023 (${TEST_MARKER})`,
        },
      });
      tariffIds.push(created.id);
    }
  }

  async function removeFixtures(): Promise<void> {
    const episodes = await prisma.pregnancyEpisode.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const episodeIds = episodes.map((episode) => episode.id);
    const encounters = await prisma.encounter.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const encounterIds = encounters.map((encounter) => encounter.id);
    const visits = await prisma.antenatalVisit.findMany({
      where: { encounterId: { in: encounterIds } },
      select: { id: true },
    });
    const deliveries = await prisma.deliveryRecord.findMany({
      where: { pregnancyEpisodeId: { in: episodeIds } },
      select: { id: true },
    });
    const courses = await prisma.familyPlanningRecord.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const postnatal = await prisma.postnatalVisit.findMany({
      where: { pregnancyEpisodeId: { in: episodeIds } },
      select: { id: true },
    });
    const sourceIds = [
      ...encounterIds,
      ...visits.map((visit) => visit.id),
      ...deliveries.map((delivery) => delivery.id),
      ...courses.map((course) => course.id),
      ...postnatal.map((visit) => visit.id),
    ];
    await prisma.bpjsNonCapitationClaimMark.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await prisma.document.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.familyPlanningRecord.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.postnatalVisit.deleteMany({ where: { pregnancyEpisodeId: { in: episodeIds } } });
    await prisma.antenatalVisit.deleteMany({ where: { encounterId: { in: encounterIds } } });
    await prisma.deliveryRecord.deleteMany({ where: { pregnancyEpisodeId: { in: episodeIds } } });
    await prisma.pregnancyEpisode.deleteMany({ where: { id: { in: episodeIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({
      where: { licenseNumber: { startsWith: TEST_MARKER } },
    });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    await prisma.bpjsNonCapitationTariff.deleteMany({ where: { id: { in: tariffIds } } });
    await prisma.userRole.deleteMany({
      where: { userId: { in: [ADMIN_USER_ID, READER_USER_ID, OUTSIDER_USER_ID] } },
    });
    await prisma.role.deleteMany({ where: { code: { in: [ADMIN_ROLE_CODE, READER_ROLE_CODE] } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PdfRendererService)
      .useValue(pdfRendererMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);
    savedSettings = await prisma.bpjsNonCapitationSettings.findFirst({
      where: { facilityId: null },
    });
    await seedActors();
    await seedTariffs();
    await seedMonth();
    const sign = (sub: string): Promise<string> =>
      jwtService.signAsync(
        { sub, email: `${TEST_MARKER}-${sub}@example.test` },
        { secret: JWT_SECRET },
      );
    [adminToken, readerToken, outsiderToken] = await Promise.all([
      sign(ADMIN_USER_ID),
      sign(READER_USER_ID),
      sign(OUTSIDER_USER_ID),
    ]);
  });

  afterAll(async () => {
    await removeFixtures();
    if (savedSettings === null) {
      await prisma.bpjsNonCapitationSettings.deleteMany({ where: { facilityId: null } });
    } else {
      await prisma.bpjsNonCapitationSettings.update({
        where: { id: savedSettings.id },
        data: {
          networkParentProviderCode: savedSettings.networkParentProviderCode,
          networkParentProviderName: savedSettings.networkParentProviderName,
          isNetworkParentGovernmentOwned: savedSettings.isNetworkParentGovernmentOwned,
          hasOwnEclaimLogin: savedSettings.hasOwnEclaimLogin,
          filingDayOfMonth: savedSettings.filingDayOfMonth,
          updatedById: savedSettings.updatedById,
        },
      });
    }
    await prisma.user.updateMany({
      where: { id: { in: [ADMIN_USER_ID, READER_USER_ID, OUTSIDER_USER_ID] } },
      data: { isActive: false },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('answers 403 without a bpjs.non-capitation key', async () => {
    const recap = await asUser(outsiderToken, 'get', RECAP_PATH).query({ month: MONTH });
    const marks = await asUser(readerToken, 'post', MARKS_PATH).send({
      month: MONTH,
      items: [{ serviceType: 'ANTENATAL_MIDWIFE', sourceId: randomUUID() }],
    });

    expect(recap.status).toBe(403);
    expect(marks.status).toBe(403);
  });

  it('lists one line per payable unit for the BPJS mothers only', async () => {
    const response = await asUser(readerToken, 'get', RECAP_PATH).query({ month: MONTH });

    expect(response.status).toBe(200);
    const lines = response.body.data.lines as Array<{
      serviceType: string;
      patientName: string;
      tariffAmount: number | null;
      status: string;
      bpjsNumberLast4: string;
    }>;
    const ours = lines.filter(
      (line) => line.patientName === 'Ibu A' || line.patientName === 'Ibu B',
    );
    expect(ours.map((line) => [line.serviceType, line.tariffAmount]).sort()).toEqual(
      [
        ['ANTENATAL_MIDWIFE', 70000],
        ['ANTENATAL_MIDWIFE', 70000],
        ['PRE_REFERRAL', 200000],
        ['DELIVERY_HEALTH_WORKER_TEAM', 800000],
        ['POSTNATAL_MOTHER_NEWBORN', 50000],
        ['FAMILY_PLANNING_IUD', 105000],
      ].sort(),
    );
    expect(lines.some((line) => line.patientName === 'Ibu C')).toBe(false);
    expect(ours.every((line) => line.status === 'OPEN' && line.bpjsNumberLast4 === '4821')).toBe(
      true,
    );
    expect(JSON.stringify(response.body)).not.toContain('fixture-cipher');
  });

  it('marks a line once: the second mark is a no-op with one mark and one audit row', async () => {
    const body = {
      month: MONTH,
      items: [{ serviceType: 'ANTENATAL_MIDWIFE', sourceId: antenatalVisitId }],
    };

    const first = await asUser(adminToken, 'post', MARKS_PATH).send(body);
    const second = await asUser(adminToken, 'post', MARKS_PATH).send(body);

    expect(first.status).toBe(200);
    expect(first.body.data.results[0].outcome).toBe('MARKED');
    expect(second.body.data.results[0].outcome).toBe('ALREADY_MARKED');
    expect(
      await prisma.bpjsNonCapitationClaimMark.count({ where: { sourceId: antenatalVisitId } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'NON_CAPITATION_CLAIM_MARKED',
          resourceId: `ANTENATAL_MIDWIFE:${antenatalVisitId}`,
        },
      }),
    ).toBe(1);
    const recap = await asUser(adminToken, 'get', RECAP_PATH).query({ month: MONTH });
    const marked = (recap.body.data.lines as Array<{ sourceId: string; status: string }>).find(
      (line) => line.sourceId === antenatalVisitId,
    );
    expect(marked?.status).toBe('SENT');
  });

  it('answers NOT_IN_RECAP for a source that is not a line of the month', async () => {
    const response = await asUser(adminToken, 'post', MARKS_PATH).send({
      month: '2031-09',
      items: [{ serviceType: 'ANTENATAL_MIDWIFE', sourceId: antenatalVisitId }],
    });

    expect(response.body.data.results[0].outcome).toBe('NOT_IN_RECAP');
  });

  it('streams the CSV and the PDF letter, each audited as an export', async () => {
    const csv = await asUser(adminToken, 'get', RECAP_PATH).query({ month: MONTH, format: 'csv' });
    const pdf = await asUser(adminToken, 'get', RECAP_PATH)
      .query({ month: MONTH, format: 'pdf' })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('****4821');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'EXPORT',
          resource: 'bpjs-non-capitation-recap',
          actorUserId: ADMIN_USER_ID,
        },
      }),
    ).toBe(2);
  });

  it('saves the induk settings and refuses a tariff that overlaps a later row', async () => {
    const saved = await asUser(adminToken, 'put', '/api/v1/bpjs/non-capitation/settings').send({
      networkParentProviderCode: 'E2E0001',
      networkParentProviderName: 'Klinik Induk E2E',
      isNetworkParentGovernmentOwned: false,
      hasOwnEclaimLogin: null,
      filingDayOfMonth: 12,
    });
    const recap = await asUser(adminToken, 'get', RECAP_PATH).query({ month: MONTH });
    const overlap = await asUser(adminToken, 'post', '/api/v1/bpjs/non-capitation/tariffs').send({
      serviceType: 'ANTENATAL_MIDWIFE',
      amount: 75000,
      validFrom: '2030-12-31',
      regulationReference: 'Overlapping row',
    });

    expect(saved.status).toBe(200);
    expect(saved.body.data.isConfigured).toBe(true);
    expect(recap.body.data.filingDeadline).toBe('2031-11-12');
    expect(recap.body.data.maximumCoachingFeeAmount).not.toBeNull();
    expect(overlap.status).toBe(409);
    expect(JSON.stringify(overlap.body)).toContain('NON_CAPITATION_TARIFF_OVERLAP');
  });
});
