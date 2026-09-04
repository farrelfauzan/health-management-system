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

/**
 * `P16-T24` acceptance against real Postgres.
 *
 * Three things only the database can prove live here: the `(patient,
 * channel)` upsert — a second capture must rewrite the one row, not add a
 * second — the audit rows FR-E4-18 requires, and that `BERHENTI` arriving
 * through the gateway's own inbound path revokes WhatsApp consent, sends the
 * confirmation, and leaves email consent untouched.
 *
 * Runs against `DATABASE_URL`. The actor, role and patient are created here
 * and removed afterwards; nothing depends on the seed. Audit rows are the one
 * thing that stays — the table is append-only by trigger — so every audit
 * assertion is scoped to rows written after this run began.
 */
describe('Document delivery integration', () => {
  const TEST_MARKER = 'p16t24-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = 'a24f0c6e-7d7c-4b6a-9c1e-2f3a4b5c6d7e';
  const ADMIN_ROLE_CODE = 'P16T24_SPEC_ADMIN';
  const NOTICE_VERSION_CODE = `${TEST_MARKER}-notice`;
  const PATIENT_PHONE_DIGITS = '628129990024';
  const CHAT_ID = `${PATIENT_PHONE_DIGITS}@s.whatsapp.net`;
  const TEST_ENV: Record<string, string> = {
    CS_CHANNEL_ENABLED: 'true',
    WA_GATEWAY_KIND: 'GOWA',
  };

  const PATIENT_PERMISSIONS = [
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
  let adminToken: string;
  let patientId: string;
  let consentsPath: string;
  let runStartedAt: Date;

  function asAdmin(method: 'get' | 'put', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  function buildGowaEvent(text: string, messageId: string): GowaWebhookEventInput {
    return {
      event: 'message',
      device_id: '628111000111@s.whatsapp.net',
      payload: {
        id: messageId,
        chat_id: CHAT_ID,
        from: CHAT_ID,
        from_name: 'Rina',
        timestamp: '2026-09-28T03:12:00Z',
        is_from_me: false,
        body: text,
      },
    } as GowaWebhookEventInput;
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
    for (const entry of PATIENT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: PATIENT_PERMISSIONS.map((entry) => entry.permissionKey) } },
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

  async function seedPatient(): Promise<void> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-${Date.now()}`,
        fullName: 'Rina Spec',
        dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0812-9990-024',
        address: 'Jl. Uji No. 24',
        email: 'rina@example.test',
      },
      select: { id: true },
    });
    patientId = patient.id;
    consentsPath = `/api/v1/patients/${patientId}/delivery-consents`;
    await prisma.channelPatientLink.create({
      data: {
        channel: 'WHATSAPP',
        externalChatId: CHAT_ID,
        phoneNumber: PATIENT_PHONE_DIGITS,
        fullName: 'Rina Spec',
        patientId,
        verificationStatus: 'OTP_VERIFIED',
        verifiedAt: new Date(),
      },
    });
    // Dated far in the past so it is only "current" on a database with no
    // real notice — which is what CI has — and never displaces a real one.
    // Upserted rather than created because it cannot be removed afterwards.
    await prisma.privacyNoticeVersion.upsert({
      where: { version: NOTICE_VERSION_CODE },
      update: {},
      create: {
        version: NOTICE_VERSION_CODE,
        effectiveAt: new Date('2001-01-01T00:00:00.000Z'),
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
    await prisma.channelPatientLink.deleteMany({ where: { externalChatId: CHAT_ID } });
    await prisma.channelInboundReceipt.deleteMany({ where: { externalChatId: CHAT_ID } });
    await prisma.patientDeliveryConsent.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    // The notice version stays: the table is immutable by trigger, and a
    // version dated 2001 displaces nothing.
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
    await removeFixtures();
    await seedActor();
    await seedPatient();
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

  it('rejects an anonymous caller', async () => {
    const response = await request(app.getHttpServer()).get(consentsPath);

    expect(response.status).toBe(401);
  });

  it('denies both channels by default for a patient nobody has asked', async () => {
    const response = await asAdmin('get', consentsPath);

    expect(response.status).toBe(200);
    expect(response.body.data.patientId).toBe(patientId);
    expect(response.body.data.channels).toEqual([
      {
        channel: 'WHATSAPP',
        consent: null,
        isDeliveryAllowed: false,
        refusalReason: 'CONSENT_MISSING',
      },
      {
        channel: 'EMAIL',
        consent: null,
        isDeliveryAllowed: false,
        refusalReason: 'CONSENT_MISSING',
      },
    ]);
  });

  it('captures WhatsApp consent with the notice in force and the acting user, and audits it', async () => {
    const currentNotice = await prisma.privacyNoticeVersion.findFirst({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: 'desc' },
      select: { id: true, version: true },
    });

    const response = await asAdmin('put', consentsPath).send({
      channel: 'WHATSAPP',
      isGranted: true,
    });

    expect(response.status).toBe(200);
    const whatsapp = response.body.data.channels.find(
      (entry: { channel: string }) => entry.channel === 'WHATSAPP',
    );
    expect(whatsapp.consent).toEqual(
      expect.objectContaining({
        isGranted: true,
        noticeVersion: currentNotice,
        grantedBy: { id: ADMIN_USER_ID, email: `${TEST_MARKER}-admin@example.test` },
        revokedAt: null,
        revokedReason: null,
      }),
    );
    // The link is OTP-verified for this patient, so consent opens the channel.
    expect(whatsapp.isDeliveryAllowed).toBe(true);
    expect(whatsapp.refusalReason).toBeNull();
    const auditRows = await prisma.auditLog.findMany({
      where: { patientId, action: 'DELIVERY_CONSENT_GRANTED', occurredAt: { gte: runStartedAt } },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.actorUserId).toBe(ADMIN_USER_ID);
    expect(auditRows[0]?.metadata).toEqual({
      channel: 'WHATSAPP',
      noticeVersionId: currentNotice?.id ?? null,
    });
  });

  it('rewrites the one (patient, channel) row on a second capture rather than adding another', async () => {
    const response = await asAdmin('put', consentsPath).send({
      channel: 'WHATSAPP',
      isGranted: true,
    });

    expect(response.status).toBe(200);
    const rows = await prisma.patientDeliveryConsent.findMany({
      where: { patientId, channel: 'WHATSAPP' },
    });
    expect(rows).toHaveLength(1);
  });

  it('captures email consent independently and reports it ready when an address is on file', async () => {
    const response = await asAdmin('put', consentsPath).send({ channel: 'EMAIL', isGranted: true });

    expect(response.status).toBe(200);
    const email = response.body.data.channels.find(
      (entry: { channel: string }) => entry.channel === 'EMAIL',
    );
    expect(email.isDeliveryAllowed).toBe(true);
    expect(email.refusalReason).toBeNull();
  });

  it('refuses a malformed body', async () => {
    const response = await asAdmin('put', consentsPath).send({ channel: 'FAX', isGranted: true });

    expect(response.status).toBe(400);
  });

  describe('BERHENTI through the inbound path', () => {
    it('revokes WhatsApp consent, confirms in Indonesian, audits, and leaves email alone', async () => {
      const outcome = await normalizer.receiveWhatsappEvent(
        buildGowaEvent('BERHENTI', `${TEST_MARKER}-msg-1`),
      );

      expect(outcome).toBe('ACCEPTED');
      // Claimed before the sink: the conversation never sees the keyword.
      expect(sinkMock.handleInboundMessage).not.toHaveBeenCalled();
      expect(sentTexts).toEqual([
        {
          externalChatId: CHAT_ID,
          text: expect.stringContaining('tidak akan lagi mengirim dokumen'),
        },
      ]);
      const consents = await prisma.patientDeliveryConsent.findMany({ where: { patientId } });
      // Sorted here: a Postgres enum orders by declaration, not alphabet.
      const consentStates = consents
        .map((row) => [row.channel, row.isGranted, row.revokedReason])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
      expect(consentStates).toEqual([
        ['EMAIL', true, null],
        ['WHATSAPP', false, 'PATIENT_KEYWORD'],
      ]);
      const auditRows = await prisma.auditLog.findMany({
        where: {
          patientId,
          action: 'DELIVERY_CONSENT_OPTED_OUT',
          occurredAt: { gte: runStartedAt },
        },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]?.actorUserId).toBeNull();
    });

    it('is honoured before the next send, on the read the send dialog makes', async () => {
      const response = await asAdmin('get', consentsPath);

      const whatsapp = response.body.data.channels.find(
        (entry: { channel: string }) => entry.channel === 'WHATSAPP',
      );
      expect(whatsapp.isDeliveryAllowed).toBe(false);
      expect(whatsapp.refusalReason).toBe('CONSENT_REVOKED');
      expect(whatsapp.consent.revokedReason).toBe('PATIENT_KEYWORD');
      const email = response.body.data.channels.find(
        (entry: { channel: string }) => entry.channel === 'EMAIL',
      );
      expect(email.isDeliveryAllowed).toBe(true);
    });

    it('does not confirm a redelivered keyword twice', async () => {
      const outcome = await normalizer.receiveWhatsappEvent(
        buildGowaEvent('BERHENTI', `${TEST_MARKER}-msg-1`),
      );

      expect(outcome).toBe('DUPLICATE');
      expect(sentTexts).toHaveLength(0);
    });

    it('lets an ordinary message through to the conversation', async () => {
      await normalizer.receiveWhatsappEvent(
        buildGowaEvent('Klinik buka jam berapa?', `${TEST_MARKER}-msg-2`),
      );

      expect(sinkMock.handleInboundMessage).toHaveBeenCalledTimes(1);
      expect(sentTexts).toHaveLength(0);
    });
  });

  it('lets the counter re-capture after an opt-out, clearing the revocation', async () => {
    const response = await asAdmin('put', consentsPath).send({
      channel: 'WHATSAPP',
      isGranted: true,
    });

    const whatsapp = response.body.data.channels.find(
      (entry: { channel: string }) => entry.channel === 'WHATSAPP',
    );
    expect(whatsapp.consent.isGranted).toBe(true);
    expect(whatsapp.consent.revokedAt).toBeNull();
    expect(whatsapp.consent.revokedReason).toBeNull();
    expect(whatsapp.isDeliveryAllowed).toBe(true);
  });

  it('withdraws at the counter with the STAFF reason and audits it', async () => {
    const response = await asAdmin('put', consentsPath).send({
      channel: 'WHATSAPP',
      isGranted: false,
    });

    expect(response.status).toBe(200);
    const whatsapp = response.body.data.channels.find(
      (entry: { channel: string }) => entry.channel === 'WHATSAPP',
    );
    expect(whatsapp.consent.revokedReason).toBe('STAFF');
    expect(whatsapp.refusalReason).toBe('CONSENT_REVOKED');
    const auditRows = await prisma.auditLog.findMany({
      where: { patientId, action: 'DELIVERY_CONSENT_WITHDRAWN', occurredAt: { gte: runStartedAt } },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('answers 404 for a patient that does not exist', async () => {
    const response = await asAdmin(
      'get',
      '/api/v1/patients/00000000-0000-4000-8000-000000000000/delivery-consents',
    );

    expect(response.status).toBe(404);
  });
});
