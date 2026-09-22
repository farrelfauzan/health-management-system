import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { GowaWebhookEventInput } from '@hms/shared-types';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';
import { WhatsappGatewayService } from '../channel-gateway/infrastructure/whatsapp-gateway.service';
import { InboundMessageNormalizerService } from '../channel-gateway/service/inbound-message-normalizer.service';
import { InboundMessageSink } from '../channel-gateway/service/inbound-message-sink.service';
import { MaternalVisitReminderWorker } from './service/maternal-visit-reminder.worker';

const ONE_DAY_IN_MILLISECONDS = 86_400_000;

/** The clinic's calendar date `days` from today, on the Jakarta clock. */
function clinicDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  return new Date(new Date(`${today}T00:00:00.000Z`).getTime() + days * ONE_DAY_IN_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The due worklist and its reminders against Postgres (P25-T17), through the
 * real module graph with only the WhatsApp bridge stubbed.
 *
 * The ticket's acceptance, end to end: Ibu Rina gave birth two days ago, so
 * her KF2 window opens tomorrow; she consented at the desk and her number is
 * verified. The 09:00 sweep sends her exactly one message and the next sweep
 * sends nothing. Ibu Sari is due the same week without consent: she is on the
 * worklist and receives nothing. Rina's BERHENTI then revokes the consent
 * through the one inbound opt-out handler.
 */
describe('Maternal visit reminders (P25-T17)', () => {
  const TEST_MARKER = 'p25t17-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = 'b7e2c1d4-3f5a-4b6c-8d9e-0f1a2b3c4d17';
  const ADMIN_ROLE_CODE = 'P25T17_SPEC_ADMIN';
  const NOTICE_VERSION_CODE = `${TEST_MARKER}-notice`;
  const RINA_PHONE_DIGITS = '628129990171';
  const SARI_PHONE_DIGITS = '628129990172';
  const RINA_CHAT_ID = `${RINA_PHONE_DIGITS}@s.whatsapp.net`;
  const SARI_CHAT_ID = `${SARI_PHONE_DIGITS}@s.whatsapp.net`;
  const TEST_ENV: Record<string, string> = {
    CS_CHANNEL_ENABLED: 'true',
    WA_GATEWAY_KIND: 'GOWA',
    CLINIC_TIMEZONE: 'Asia/Jakarta',
  };
  const PERMISSIONS = [
    {
      permissionKey: 'patient.read:any',
      resource: 'Patient',
      action: 'read',
      scope: PermissionScope.ANY,
    },
    {
      permissionKey: 'patient.update:any',
      resource: 'Patient',
      action: 'update',
      scope: PermissionScope.ANY,
    },
    {
      permissionKey: 'encounter.read:any',
      resource: 'Encounter',
      action: 'read',
      scope: PermissionScope.ANY,
    },
  ] as const;

  const sentTexts: Array<{ externalChatId: string; text: string }> = [];
  const whatsappGatewayMock = {
    sendText: jest.fn(async (requestBody: { externalChatId: string; text: string }) => {
      sentTexts.push(requestBody);
    }),
    sendDocument: jest.fn().mockResolvedValue(undefined),
  };
  const sinkMock = { handleInboundMessage: jest.fn().mockResolvedValue(undefined) };
  const previousEnv: Record<string, string | undefined> = {};

  let app: INestApplication;
  let prisma: PrismaService;
  let normalizer: InboundMessageNormalizerService;
  let worker: MaternalVisitReminderWorker;
  let adminToken: string;
  let rinaId: string;
  let sariId: string;
  let attendantDoctorId: string;
  let runStartedAt: Date;

  function asAdmin(method: 'get' | 'put', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  async function seedActor(): Promise<void> {
    await prisma.user.upsert({
      where: { id: ADMIN_USER_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: ADMIN_USER_ID,
        email: `${TEST_MARKER}-admin@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
    for (const entry of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: ADMIN_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: ADMIN_ROLE_CODE, name: `${TEST_MARKER} admin`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: ADMIN_USER_ID, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: ADMIN_USER_ID, roleId: role.id },
    });
  }

  /** A mother two days after the birth, with a WhatsApp number verified for her. */
  async function seedMother(
    fullName: string,
    phoneDigits: string,
    chatId: string,
  ): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-${phoneDigits}`,
        fullName,
        dateOfBirth: new Date('1994-05-05T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: `0${phoneDigits.slice(2)}`,
        address: 'Jl. Uji No. 17',
      },
      select: { id: true },
    });
    await prisma.channelPatientLink.create({
      data: {
        channel: 'WHATSAPP',
        externalChatId: chatId,
        phoneNumber: phoneDigits,
        fullName,
        patientId: patient.id,
        verificationStatus: 'OTP_VERIFIED',
        verifiedAt: new Date(),
      },
    });
    const episode = await prisma.pregnancyEpisode.create({
      data: {
        patientId: patient.id,
        status: 'DELIVERED',
        endReason: 'DELIVERY',
        endedAt: new Date(),
        estimatedDeliveryDate: new Date(`${clinicDatePlus(-2)}T00:00:00.000Z`),
        eddSource: 'CLINICAL',
        gravida: 1,
        para: 0,
        abortus: 0,
        createdById: ADMIN_USER_ID,
      },
      select: { id: true },
    });
    await prisma.deliveryRecord.create({
      data: {
        pregnancyEpisodeId: episode.id,
        attendantDoctorId,
        // 10:00 WIB two clinic days ago: KF2 (days 3–7) opens tomorrow.
        birthAt: new Date(`${clinicDatePlus(-2)}T10:00:00+07:00`),
        mode: 'SPONTANEOUS_VAGINAL',
        recordedById: ADMIN_USER_ID,
      },
    });
    return patient.id;
  }

  async function seedFixtures(): Promise<void> {
    await seedActor();
    const specialty = await prisma.specialty.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (specialty === null) {
      throw new Error('The specialty catalogue is empty; its migration seeds it');
    }
    const attendant = await prisma.doctorProfile.create({
      data: {
        fullName: `${TEST_MARKER} Bidan`,
        profession: 'MIDWIFE',
        licenseNumber: `${TEST_MARKER}-sip`,
        specialtyId: specialty.id,
      },
      select: { id: true },
    });
    attendantDoctorId = attendant.id;
    rinaId = await seedMother('Ibu Rina', RINA_PHONE_DIGITS, RINA_CHAT_ID);
    sariId = await seedMother('Ibu Sari', SARI_PHONE_DIGITS, SARI_CHAT_ID);
    await prisma.privacyNoticeVersion.upsert({
      where: { version: NOTICE_VERSION_CODE },
      update: {},
      create: {
        version: NOTICE_VERSION_CODE,
        effectiveAt: new Date('2001-01-17T00:00:00.000Z'),
        contentId: 'uji',
        contentEn: 'test',
        contentHashId: `${TEST_MARKER}-id`,
        contentHashEn: `${TEST_MARKER}-en`,
      },
    });
  }

  async function removeFixtures(): Promise<void> {
    const patients = await prisma.patientProfile.findMany({
      where: { mrn: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const patientIds = patients.map((patient) => patient.id);
    const chatIds = [RINA_CHAT_ID, SARI_CHAT_ID];
    await prisma.channelPatientLink.deleteMany({ where: { externalChatId: { in: chatIds } } });
    await prisma.channelInboundReceipt.deleteMany({ where: { externalChatId: { in: chatIds } } });
    await prisma.patientDeliveryConsent.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.deliveryRecord.deleteMany({
      where: { pregnancyEpisode: { patientId: { in: patientIds } } },
    });
    await prisma.pregnancyEpisode.deleteMany({ where: { patientId: { in: patientIds } } });
    // Consent and reminder rows go with the patient (ON DELETE CASCADE).
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { licenseNumber: `${TEST_MARKER}-sip` } });
    const roles = await prisma.role.findMany({
      where: { code: ADMIN_ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: ADMIN_USER_ID }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: ADMIN_USER_ID } });
    await prisma.user.deleteMany({ where: { id: ADMIN_USER_ID } });
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WhatsappGatewayService)
      .useValue(whatsappGatewayMock)
      .overrideProvider(InboundMessageSink)
      .useValue(sinkMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    normalizer = moduleRef.get(InboundMessageNormalizerService);
    worker = moduleRef.get(MaternalVisitReminderWorker);
    await removeFixtures();
    await seedFixtures();
    runStartedAt = new Date();
    adminToken = await moduleRef
      .get(JwtService)
      .signAsync(
        { sub: ADMIN_USER_ID, email: `${TEST_MARKER}-admin@example.test` },
        { secret: JWT_SECRET },
      );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  beforeEach(() => {
    sentTexts.length = 0;
    jest.clearAllMocks();
  });

  /** 09:05 on the clinic's clock today. */
  function buildMorningInstant(): Date {
    return new Date(`${clinicDatePlus(0)}T09:05:00+07:00`);
  }

  it('starts with no consent for a patient nobody has asked', async () => {
    const response = await asAdmin('get', `/api/v1/patients/${rinaId}/visit-reminder-consent`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ patientId: rinaId, consent: null });
  });

  it('captures Rina’s consent at the desk against the notice in force, leaving delivery consent untouched', async () => {
    const response = await asAdmin('put', `/api/v1/patients/${rinaId}/visit-reminder-consent`).send(
      {
        isGranted: true,
      },
    );

    expect(response.status).toBe(200);
    expect(response.body.data.consent).toEqual(
      expect.objectContaining({ purpose: 'VISIT_REMINDER', isGranted: true, revokedReason: null }),
    );
    expect(response.body.data.consent.noticeVersion).not.toBeNull();
    expect(await prisma.patientDeliveryConsent.count({ where: { patientId: rinaId } })).toBe(0);
  });

  it('sends Rina exactly one message through the gateway, and nothing on the next sweep', async () => {
    const firstSweep = await worker.sweepOnce(buildMorningInstant());
    const secondSweep = await worker.sweepOnce(buildMorningInstant());

    expect(firstSweep).toBe(1);
    expect(secondSweep).toBe(0);
    expect(whatsappGatewayMock.sendText).toHaveBeenCalledTimes(1);
    expect(sentTexts).toEqual([
      { externalChatId: RINA_CHAT_ID, text: expect.stringContaining('kunjungan nifas') },
    ]);
    const rinaReminders = await prisma.maternalVisitReminder.findMany({
      where: { patientId: rinaId },
    });
    expect(rinaReminders.map((row) => row.visitKey)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^PNC:.+:KF2$/)]),
    );
    expect(rinaReminders.every((row) => row.status === 'SENT')).toBe(true);
    expect(await prisma.maternalVisitReminder.count({ where: { patientId: sariId } })).toBe(0);
  });

  it('lists both mothers on the worklist, with Rina reminded and Sari not', async () => {
    const response = await asAdmin('get', '/api/v1/maternal-visits/due');

    expect(response.status).toBe(200);
    const items = response.body.data.items as Array<{
      patientId: string;
      code: string;
      hasReminderConsent: boolean;
      reminder: { status: string } | null;
    }>;
    const rinaKf2 = items.find((item) => item.patientId === rinaId && item.code === 'KF2');
    const sariKf2 = items.find((item) => item.patientId === sariId && item.code === 'KF2');
    expect(rinaKf2).toEqual(
      expect.objectContaining({
        hasReminderConsent: true,
        reminder: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(sariKf2).toEqual(expect.objectContaining({ hasReminderConsent: false, reminder: null }));
    expect(response.body.data.from).toBe(clinicDatePlus(0));
    expect(response.body.data.to).toBe(clinicDatePlus(6));
  });

  it('refuses a range longer than 31 days', async () => {
    const response = await asAdmin(
      'get',
      `/api/v1/maternal-visits/due?from=${clinicDatePlus(0)}&to=${clinicDatePlus(40)}`,
    );

    expect(response.status).toBe(400);
  });

  it('revokes Rina’s reminder consent when she replies BERHENTI, audited with no actor', async () => {
    const outcome = await normalizer.receiveWhatsappEvent({
      event: 'message',
      device_id: '628111000111@s.whatsapp.net',
      payload: {
        id: `${TEST_MARKER}-msg-1`,
        chat_id: RINA_CHAT_ID,
        from: RINA_CHAT_ID,
        from_name: 'Rina',
        timestamp: '2026-10-01T03:12:00Z',
        is_from_me: false,
        body: 'BERHENTI',
      },
    } as GowaWebhookEventInput);

    expect(outcome).toBe('ACCEPTED');
    const consent = await prisma.patientVisitReminderConsent.findUnique({
      where: { patientId: rinaId },
    });
    expect(consent).toEqual(
      expect.objectContaining({ isGranted: false, revokedReason: 'PATIENT_KEYWORD' }),
    );
    const auditRows = await prisma.auditLog.findMany({
      where: {
        patientId: rinaId,
        action: 'VISIT_REMINDER_CONSENT_OPTED_OUT',
        occurredAt: { gte: runStartedAt },
      },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.actorUserId).toBeNull();
    expect(sentTexts).toEqual([
      { externalChatId: RINA_CHAT_ID, text: expect.stringContaining('pengingat kunjungan') },
    ]);
  });
});
