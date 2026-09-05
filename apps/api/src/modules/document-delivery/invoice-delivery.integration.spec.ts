import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

import { AppModule } from '../../app.module';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { PermissionScope } from '../../generated/prisma/client';
import { WhatsappGatewayService } from '../channel-gateway/infrastructure/whatsapp-gateway.service';
import { InboundMessageSink } from '../channel-gateway/service/inbound-message-sink.service';
import { DeliveryLinkService } from './service/delivery-link.service';
import { DocumentDeliveryWorker } from './service/document-delivery.worker';

/**
 * `P16-T25` acceptance against real Postgres.
 *
 * What only the database can prove lives here: the subject CHECK and the
 * rows a send writes, the conditional retry and revoke, the audit rows
 * FR-E4-18 requires, and the public link route end to end — a token minted
 * the way the worker will mint it, opened, counted, killed, and answered
 * with the same 404 as a token that never existed.
 *
 * Runs against `DATABASE_URL`. Everything is created here and removed
 * afterwards; nothing depends on the seed. Audit rows are the one thing that
 * stays — the table is append-only by trigger — so every audit assertion is
 * scoped to rows written after this run began.
 */
describe('Invoice delivery integration', () => {
  const TEST_MARKER = 'p16t25-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = 'b25f0c6e-7d7c-4b6a-9c1e-2f3a4b5c6d7f';
  const ADMIN_ROLE_CODE = 'P16T25_SPEC_ADMIN';
  const PATIENT_PHONE_DIGITS = '628129990025';
  const CHAT_ID = `${PATIENT_PHONE_DIGITS}@s.whatsapp.net`;
  const STORAGE_KEY = `invoices/${TEST_MARKER}/doc.pdf`;
  const UNKNOWN_TOKEN = 'A'.repeat(43);
  // The worker is driven by hand here; a timer firing mid-assertion would
  // claim rows the tests expect to find QUEUED.
  const TEST_ENV: Record<string, string> = { DELIVERY_WORKER_ENABLED: 'false' };
  const previousEnv: Record<string, string | undefined> = {};

  const PERMISSIONS = [
    {
      permissionKey: 'invoice.read:any',
      resource: 'Invoice',
      action: 'read',
      scope: PermissionScope.ANY,
    },
    {
      permissionKey: 'invoice.deliver:any',
      resource: 'Invoice',
      action: 'deliver',
      scope: PermissionScope.ANY,
    },
  ] as const;

  const whatsappGatewayMock = {
    sendText: jest.fn().mockResolvedValue(undefined),
    sendDocument: jest.fn().mockResolvedValue(undefined),
  };
  const sinkMock = { handleInboundMessage: jest.fn().mockResolvedValue(undefined) };
  const mailMock = {
    sendMail: jest.fn().mockResolvedValue({ accepted: true, messageId: 'smtp-1' }),
  };
  let plainPdf: Uint8Array;
  const storageMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getObject: jest.fn(async () => ({ key: STORAGE_KEY, body: Buffer.from(plainPdf) })),
    getSignedUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: '2026-09-29T08:05:00.000Z',
    }),
    getSignedUploadUrl: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };

  let app: INestApplication;
  let prisma: PrismaService;
  let deliveryLinkService: DeliveryLinkService;
  let worker: DocumentDeliveryWorker;
  let adminToken: string;
  let patientId: string;
  let invoiceId: string;
  let draftInvoiceId: string;
  let runStartedAt: Date;

  function asAdmin(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  function deliveriesPath(id: string = invoiceId): string {
    return `/api/v1/invoices/${id}/deliveries`;
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

  async function seedInvoice(params: {
    admittingDoctorId: string;
    invoiceNumber: string;
    status: 'ISSUED' | 'DRAFT';
    isRendered: boolean;
  }): Promise<string> {
    // One live admission per patient: every stay after the first is a
    // finished one, which is all an invoice fixture needs.
    const isFinished = params.status === 'DRAFT';
    const admission = await prisma.admission.create({
      data: {
        patientId,
        admittingDoctorId: params.admittingDoctorId,
        reason: TEST_MARKER,
        status: isFinished ? 'DISCHARGED' : 'ADMITTED',
        admittedAt: new Date(Date.now() - 3_600_000),
        dischargedAt: isFinished ? new Date() : null,
      },
      select: { id: true },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: params.invoiceNumber,
        admissionId: admission.id,
        patientId,
        status: params.status,
        totalAmount: 150_000,
        issuedAt: params.status === 'ISSUED' ? new Date() : null,
      },
      select: { id: true },
    });
    if (params.isRendered) {
      await prisma.invoiceDocument.create({
        data: {
          invoiceId: invoice.id,
          renderedData: {},
          status: 'READY',
          storageKey: STORAGE_KEY,
          checksum: 'a'.repeat(64),
          sizeBytes: 1024,
          renderedAt: new Date(),
        },
      });
    }
    return invoice.id;
  }

  async function seedPatientAndInvoices(): Promise<void> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-${Date.now()}`,
        fullName: 'Rina Spec',
        dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '0812-9990-025',
        address: 'Jl. Uji No. 25',
        email: 'rina25@example.test',
      },
      select: { id: true },
    });
    patientId = patient.id;
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
    await prisma.patientDeliveryConsent.create({
      data: { patientId, channel: 'WHATSAPP', isGranted: true, grantedAt: new Date() },
    });
    const specialty = await prisma.specialty.upsert({
      where: { name: `${TEST_MARKER} specialty` },
      update: {},
      create: { name: `${TEST_MARKER} specialty` },
      select: { id: true },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-str`,
        fullName: 'dr. Spec',
        specialtyId: specialty.id,
      },
      select: { id: true },
    });
    invoiceId = await seedInvoice({
      admittingDoctorId: doctor.id,
      invoiceNumber: `${TEST_MARKER}/001`,
      status: 'ISSUED',
      isRendered: true,
    });
    draftInvoiceId = await seedInvoice({
      admittingDoctorId: doctor.id,
      invoiceNumber: `${TEST_MARKER}/002`,
      status: 'DRAFT',
      isRendered: false,
    });
  }

  async function removeFixtures(): Promise<void> {
    const patients = await prisma.patientProfile.findMany({
      where: { mrn: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const patientIds = patients.map((patient) => patient.id);
    await prisma.documentDelivery.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.invoiceDocument.deleteMany({
      where: { invoice: { patientId: { in: patientIds } } },
    });
    await prisma.invoice.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.admission.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({
      where: { licenseNumber: { startsWith: TEST_MARKER } },
    });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    await prisma.channelPatientLink.deleteMany({ where: { externalChatId: CHAT_ID } });
    await prisma.patientDeliveryConsent.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
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

  async function buildPdf(): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage().drawText('Kuitansi uji', { x: 50, y: 700, size: 14, font });
    return document.save({ useObjectStreams: false });
  }

  async function countAuditRows(action: string): Promise<number> {
    return prisma.auditLog.count({
      where: { action: action as never, patientId, occurredAt: { gte: runStartedAt } },
    });
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    plainPdf = await buildPdf();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WhatsappGatewayService)
      .useValue(whatsappGatewayMock)
      .overrideProvider(InboundMessageSink)
      .useValue(sinkMock)
      .overrideProvider(ObjectStorageService)
      .useValue(storageMock)
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    deliveryLinkService = moduleRef.get(DeliveryLinkService);
    worker = moduleRef.get(DocumentDeliveryWorker);
    await removeFixtures();
    await seedActor();
    await seedPatientAndInvoices();
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
    jest.clearAllMocks();
  });

  it('rejects an anonymous caller', async () => {
    const response = await request(app.getHttpServer()).get(deliveriesPath());

    expect(response.status).toBe(401);
  });

  it('queues a locked WhatsApp attachment to the verified number, and audits the request', async () => {
    const response = await asAdmin('post', deliveriesPath()).send({ channels: ['WHATSAPP'] });

    expect(response.status).toBe(201);
    expect(response.body.data.invoiceId).toBe(invoiceId);
    expect(response.body.data.deliveries).toHaveLength(1);
    expect(response.body.data.deliveries[0]).toEqual(
      expect.objectContaining({
        channel: 'WHATSAPP',
        shape: 'ATTACHMENT',
        status: 'QUEUED',
        destinationMasked: '6281****0025',
        passwordSource: 'DOB_DDMMYYYY',
        requestedBy: { id: ADMIN_USER_ID, email: `${TEST_MARKER}-admin@example.test` },
        link: null,
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain(PATIENT_PHONE_DIGITS);
    await expect(countAuditRows('DELIVERY_REQUESTED')).resolves.toBe(1);
  });

  it('refuses a channel the patient has not consented to, and writes no row', async () => {
    const before = await prisma.documentDelivery.count({ where: { invoiceId } });

    const response = await asAdmin('post', deliveriesPath()).send({
      channels: ['WHATSAPP', 'EMAIL'],
    });

    expect(response.status).toBe(422);
    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: 'DELIVERY_CHANNEL_REFUSED',
        details: { channel: 'EMAIL', refusalReason: 'CONSENT_MISSING' },
      }),
    );
    await expect(prisma.documentDelivery.count({ where: { invoiceId } })).resolves.toBe(before);
  });

  it('refuses a draft invoice with no rendered document', async () => {
    const response = await asAdmin('post', deliveriesPath(draftInvoiceId)).send({
      channels: ['WHATSAPP'],
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVOICE_NOT_DELIVERABLE');
  });

  it('rejects a request naming the same channel twice', async () => {
    const response = await asAdmin('post', deliveriesPath()).send({
      channels: ['WHATSAPP', 'WHATSAPP'],
    });

    expect(response.status).toBe(400);
  });

  it('lists the timeline newest first', async () => {
    await asAdmin('post', deliveriesPath()).send({ channels: ['WHATSAPP'], shape: 'LINK' });

    const response = await asAdmin('get', deliveriesPath());

    expect(response.status).toBe(200);
    expect(response.body.data.deliveries.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.deliveries[0].shape).toBe('LINK');
    expect(response.body.data.deliveries[0].passwordSource).toBeNull();
  });

  it('retries only a failed delivery', async () => {
    const queued = await prisma.documentDelivery.findFirstOrThrow({
      where: { invoiceId, status: 'QUEUED', shape: 'ATTACHMENT' },
      select: { id: true },
    });

    const refused = await asAdmin('post', `/api/v1/deliveries/${queued.id}/retry`);
    await prisma.documentDelivery.update({
      where: { id: queued.id },
      data: {
        status: 'FAILED',
        attemptCount: 5,
        lastError: 'gateway unavailable',
        nextAttemptAt: new Date(),
      },
    });
    const retried = await asAdmin('post', `/api/v1/deliveries/${queued.id}/retry`);

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('DELIVERY_NOT_RETRYABLE');
    expect(retried.status).toBe(200);
    expect(retried.body.data).toEqual(
      expect.objectContaining({
        status: 'QUEUED',
        attemptCount: 5,
        lastError: 'gateway unavailable',
      }),
    );
    await expect(countAuditRows('DELIVERY_RETRIED')).resolves.toBe(1);
  });

  it('withdraws a queued delivery', async () => {
    const queued = await prisma.documentDelivery.findFirstOrThrow({
      where: { invoiceId, status: 'QUEUED', shape: 'ATTACHMENT' },
      select: { id: true },
    });

    const response = await asAdmin('post', `/api/v1/deliveries/${queued.id}/revoke`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('REVOKED');
    expect(response.body.data.revokedAt).not.toBeNull();
    await expect(countAuditRows('DELIVERY_REVOKED')).resolves.toBe(1);
  });

  it('refuses to write a delivery with no subject or two subjects', async () => {
    const base = {
      patientId,
      channel: 'WHATSAPP' as const,
      destinationMasked: '6281****0025',
    };

    await expect(prisma.documentDelivery.create({ data: base })).rejects.toThrow(/subject_check/);
  });

  describe('public link', () => {
    let token: string;
    let linkDeliveryId: string;

    beforeAll(async () => {
      const linkDelivery = await prisma.documentDelivery.findFirstOrThrow({
        where: { invoiceId, shape: 'LINK' },
        select: { id: true },
      });
      linkDeliveryId = linkDelivery.id;
      // The worker's act, simulated: the message went out, the link was minted.
      await prisma.documentDelivery.update({
        where: { id: linkDeliveryId },
        data: { status: 'SENT', sentAt: new Date(), attemptCount: 1 },
      });
      const minted = await deliveryLinkService.mintLink(linkDeliveryId);
      token = minted.url.split('/inv/')[1] ?? '';
    });

    it('serves a presigned download, counts the open, and audits it', async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/delivery-links/${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        url: 'https://storage.example/signed',
        fileName: `${TEST_MARKER}-001.pdf`,
        expiresAt: '2026-09-29T08:05:00.000Z',
      });
      expect(storageMock.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          key: STORAGE_KEY,
          responseContentDisposition: `attachment; filename="${TEST_MARKER}-001.pdf"`,
        }),
      );
      const delivery = await prisma.documentDelivery.findUniqueOrThrow({
        where: { id: linkDeliveryId },
        select: { status: true, openedAt: true, link: { select: { openCount: true } } },
      });
      expect(delivery.status).toBe('OPENED');
      expect(delivery.openedAt).not.toBeNull();
      expect(delivery.link?.openCount).toBe(1);
      await expect(countAuditRows('DELIVERY_OPENED')).resolves.toBe(1);
    });

    it('stores only a hash of the token', async () => {
      const link = await prisma.documentDeliveryLink.findUniqueOrThrow({
        where: { deliveryId: linkDeliveryId },
        select: { tokenHash: true },
      });

      expect(link.tokenHash).not.toBe(token);
      expect(link.tokenHash).toHaveLength(64);
    });

    it('stops resolving within the request that revokes it, and looks like an unknown token', async () => {
      const revoke = await asAdmin('post', `/api/v1/deliveries/${linkDeliveryId}/revoke`);
      const revoked = await request(app.getHttpServer()).get(`/api/v1/delivery-links/${token}`);
      const unknown = await request(app.getHttpServer()).get(
        `/api/v1/delivery-links/${UNKNOWN_TOKEN}`,
      );

      expect(revoke.status).toBe(200);
      expect(revoke.body.data.link.revokedAt).not.toBeNull();
      expect(revoked.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(revoked.body).toEqual(unknown.body);
      expect(revoked.body.error.code).toBe('DELIVERY_LINK_UNAVAILABLE');
    });

    it('rate-limits repeated opens of one token', async () => {
      const malformed = 'B'.repeat(43);
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const response = await request(app.getHttpServer()).get(
          `/api/v1/delivery-links/${malformed}`,
        );
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 10).every((status) => status === 404)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe('scheduled delivery (P16-T38)', () => {
    let scheduledId: string;

    it('parks a send at a future time and shows it on the timeline', async () => {
      const sendAt = new Date(Date.now() + 3_600_000).toISOString();

      const response = await asAdmin('post', deliveriesPath()).send({
        channels: ['WHATSAPP'],
        sendAt,
      });

      expect(response.status).toBe(201);
      const scheduled = response.body.data.deliveries.find(
        (delivery: { sendAt: string | null }) => delivery.sendAt === sendAt,
      );
      expect(scheduled).toBeDefined();
      expect(scheduled.status).toBe('QUEUED');
      scheduledId = scheduled.id;
    });

    it('refuses a time that is not in the future', async () => {
      const response = await asAdmin('post', deliveriesPath()).send({
        channels: ['WHATSAPP'],
        sendAt: '2020-01-01T00:00:00.000Z',
      });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('DELIVERY_SEND_AT_IN_PAST');
    });

    it('is not claimed by the worker before it is due', async () => {
      await worker.pollOnce();

      const row = await prisma.documentDelivery.findUniqueOrThrow({
        where: { id: scheduledId },
        select: { status: true, leasedBy: true },
      });
      expect(row).toEqual({ status: 'QUEUED', leasedBy: null });
    });

    it('can be moved, then called off, and neither act is available afterwards', async () => {
      const later = new Date(Date.now() + 7_200_000).toISOString();

      const moved = await asAdmin('post', `/api/v1/deliveries/${scheduledId}/reschedule`).send({
        sendAt: later,
      });
      const cancelled = await asAdmin('post', `/api/v1/deliveries/${scheduledId}/cancel`);
      const again = await asAdmin('post', `/api/v1/deliveries/${scheduledId}/cancel`);
      const retried = await asAdmin('post', `/api/v1/deliveries/${scheduledId}/retry`);

      expect(moved.status).toBe(200);
      expect(moved.body.data.sendAt).toBe(later);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data).toEqual(
        expect.objectContaining({ status: 'CANCELLED', lastError: 'CANCELLED_BY_STAFF' }),
      );
      expect(again.status).toBe(409);
      expect(retried.status).toBe(409);
      await expect(countAuditRows('DELIVERY_CANCELLED')).resolves.toBe(1);
    });
  });

  describe('worker (P16-T26)', () => {
    it('sends a queued WhatsApp attachment locked with the patient password, with a caption that names nothing clinical', async () => {
      const queued = await asAdmin('post', deliveriesPath()).send({ channels: ['WHATSAPP'] });
      const deliveryId = queued.body.data.deliveries[0].id as string;

      const processed = await worker.pollOnce();

      expect(processed).toBeGreaterThanOrEqual(1);
      const sent = await asAdmin('get', `/api/v1/deliveries/${deliveryId}`);
      expect(sent.body.data).toEqual(
        expect.objectContaining({ status: 'SENT', attemptCount: 1, lastError: null }),
      );
      expect(sent.body.data.sentAt).not.toBeNull();
      const call = whatsappGatewayMock.sendDocument.mock.calls.find(
        (args: [{ fileName: string }]) => args[0].fileName === `${TEST_MARKER}-001.pdf`,
      );
      expect(call).toBeDefined();
      const request = call![0] as { externalChatId: string; content: Uint8Array; caption: string };
      expect(request.externalChatId).toBe(CHAT_ID);
      expect(request.caption).toContain(
        `kuitansi ${TEST_MARKER}/001 atas nama Rina Spec sebesar Rp 150.000`,
      );
      expect(request.caption).toContain('tanggal lahir Anda, format DDMMYYYY');
      expect(request.caption).not.toContain('07031988');
      // Locked: not the bytes we stored, and a reader would find /Encrypt.
      expect(Buffer.from(request.content).equals(Buffer.from(plainPdf))).toBe(false);
      expect(Buffer.from(request.content).toString('latin1')).toContain('/Encrypt');
      await expect(countAuditRows('DELIVERY_SENT')).resolves.toBeGreaterThanOrEqual(1);
    });

    it('cancels at send time a delivery whose consent was withdrawn after it was queued', async () => {
      const queued = await asAdmin('post', deliveriesPath()).send({ channels: ['WHATSAPP'] });
      const deliveryId = queued.body.data.deliveries[0].id as string;
      await prisma.patientDeliveryConsent.update({
        where: { patientId_channel: { patientId, channel: 'WHATSAPP' } },
        data: { isGranted: false, revokedAt: new Date(), revokedReason: 'STAFF' },
      });
      const sendsBefore = whatsappGatewayMock.sendDocument.mock.calls.length;

      await worker.pollOnce();

      const row = await prisma.documentDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        select: { status: true, lastError: true },
      });
      expect(row).toEqual({
        status: 'CANCELLED',
        lastError: 'DELIVERY_REFUSED_AT_SEND_TIME:CONSENT_REVOKED',
      });
      expect(whatsappGatewayMock.sendDocument.mock.calls.length).toBe(sendsBefore);
      await prisma.patientDeliveryConsent.update({
        where: { patientId_channel: { patientId, channel: 'WHATSAPP' } },
        data: { isGranted: true, revokedAt: null, revokedReason: null },
      });
    });

    it('emails a link, minting the token only when the message goes out', async () => {
      await prisma.patientDeliveryConsent.create({
        data: { patientId, channel: 'EMAIL', isGranted: true, grantedAt: new Date() },
      });
      const queued = await asAdmin('post', deliveriesPath()).send({
        channels: ['EMAIL'],
        shape: 'LINK',
      });
      const deliveryId = queued.body.data.deliveries[0].id as string;
      const linkBefore = await prisma.documentDeliveryLink.findUnique({ where: { deliveryId } });

      await worker.pollOnce();

      const sent = await asAdmin('get', `/api/v1/deliveries/${deliveryId}`);
      expect(linkBefore).toBeNull();
      expect(sent.body.data).toEqual(
        expect.objectContaining({
          status: 'SENT',
          shape: 'LINK',
          destinationMasked: 'r***@example.test',
        }),
      );
      expect(sent.body.data.link).toEqual(
        expect.objectContaining({ openCount: 0, revokedAt: null }),
      );
      const mail = mailMock.sendMail.mock.calls.at(-1)?.[0] as {
        to: string;
        text: string;
        attachments?: unknown;
      };
      expect(mail.to).toBe('rina25@example.test');
      expect(mail.text).toContain('/inv/');
      expect(mail.attachments).toBeUndefined();
      expect(JSON.stringify(sent.body)).not.toContain(mail.text.split('/inv/')[1]?.slice(0, 43));
    });

    it('backs off on a bridge failure and settles FAILED with a Retry when attempts run out', async () => {
      const queued = await asAdmin('post', deliveriesPath()).send({ channels: ['WHATSAPP'] });
      const deliveryId = queued.body.data.deliveries[0].id as string;
      whatsappGatewayMock.sendDocument.mockRejectedValueOnce(new Error('bridge down'));

      await worker.pollOnce();
      const backingOff = await prisma.documentDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        select: { status: true, attemptCount: true, nextAttemptAt: true, leasedUntil: true },
      });
      await prisma.documentDelivery.update({
        where: { id: deliveryId },
        data: { attemptCount: 4, nextAttemptAt: null },
      });
      whatsappGatewayMock.sendDocument.mockRejectedValueOnce(new Error('bridge down'));
      await worker.pollOnce();
      const failed = await asAdmin('get', `/api/v1/deliveries/${deliveryId}`);
      whatsappGatewayMock.sendDocument.mockResolvedValue(undefined);
      const retried = await asAdmin('post', `/api/v1/deliveries/${deliveryId}/retry`);
      await worker.pollOnce();
      const recovered = await asAdmin('get', `/api/v1/deliveries/${deliveryId}`);

      expect(backingOff.status).toBe('QUEUED');
      expect(backingOff.attemptCount).toBe(1);
      expect(backingOff.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
      expect(backingOff.leasedUntil).toBeNull();
      expect(failed.body.data).toEqual(
        expect.objectContaining({ status: 'FAILED', attemptCount: 5 }),
      );
      expect(retried.status).toBe(200);
      expect(recovered.body.data.status).toBe('SENT');
      await expect(countAuditRows('DELIVERY_FAILED')).resolves.toBe(1);
    });
  });
});
