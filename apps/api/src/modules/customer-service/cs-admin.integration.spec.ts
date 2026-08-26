import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminConversationRepository } from './repository/admin-conversation.repository';
import { ChannelArrivalRepository } from './repository/channel-arrival.repository';
import { ChannelArrivalService } from './service/channel-arrival.service';
import { CsAdminService } from './service/cs-admin.service';
import { HandoffService } from './service/handoff.service';
import { NotificationRepository } from '../notification/repository/notification.repository';
import { NotificationService } from '../notification/service/notification.service';
import { ConversationRepository } from './repository/conversation.repository';
import { OutboundMessageDispatcherService } from '../channel-gateway/service/outbound-message-dispatcher.service';
import { CurrentUser } from '../../common/auth/current-user.type';

/**
 * The `PCS-T08` guarantees that only exist once real rows are involved.
 *
 * Three of them earn this file, and each is a thing the unit suite proves
 * against a mock of the very layer that could be wrong:
 *
 * **The draft merge**, which is the task's stated acceptance criterion. It is
 * four writes in one transaction across four tables, and every interesting
 * failure is a database fact: whether the appointment's foreign key follows,
 * whether the chat's link follows so the *next* booking finds the real record
 * instead of making a second draft, and whether the retired draft is soft-
 * deleted rather than removed — its MRN was quoted to a customer, and a reused
 * number is how two people end up sharing a folder.
 *
 * **The inbox's cursor**, which sorts by activity and pages by id. That pair is
 * only correct if the tiebreak works, and conversations sharing a
 * `lastMessageAt` is the normal case on a channel that receives bursts, not an
 * edge one.
 *
 * **The worklist's predicate**, which asks for bookings whose *patient* is
 * incomplete while filtering on the *appointment's* provenance. A verified
 * customer's chat booking hangs off a long-standing front-desk record, so a
 * query keyed off the patient would silently drop exactly the rows the desk
 * most needs.
 *
 * Rows are namespaced by a fixed marker and removed around each run so a shared
 * dev database is never left with test residue.
 */
describe('customer-service admin surface against Postgres', () => {
  const TEST_MARKER = 'pcs-t08-spec';
  const actor = { sub: '' } as unknown as CurrentUser;

  let prisma: PrismaService;
  let adminConversationRepository: AdminConversationRepository;
  let arrivalRepository: ChannelArrivalRepository;
  let arrivalService: ChannelArrivalService;
  let csAdminService: CsAdminService;
  let adminUserId: string;
  let doctorId: string;

  async function createConversation(params: {
    suffix: string;
    lastMessageAt: Date;
    state?: 'BOT_ACTIVE' | 'NEEDS_HUMAN' | 'HUMAN_ACTIVE';
  }): Promise<string> {
    const conversation = await prisma.conversation.create({
      data: {
        channel: 'TELEGRAM',
        externalChatId: `${TEST_MARKER}-${params.suffix}`,
        senderDisplayName: `${TEST_MARKER} customer`,
        state: params.state ?? 'BOT_ACTIVE',
        lastMessageAt: params.lastMessageAt,
      },
      select: { id: true },
    });
    return conversation.id;
  }

  async function createPatient(params: {
    suffix: string;
    source: 'FRONT_DESK' | 'CHANNEL_BOOKING';
  }): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-${params.suffix}`,
        fullName: `${TEST_MARKER} ${params.suffix}`,
        phoneNumber: '628121000009',
        source: params.source,
        ...(params.source === 'FRONT_DESK'
          ? { dateOfBirth: new Date('1990-05-12T00:00:00.000Z'), address: 'Jakarta' }
          : {}),
      },
      select: { id: true },
    });
    return patient.id;
  }

  async function createChannelAppointment(params: {
    patientId: string;
    scheduledAt: Date;
    referenceCode: string;
  }): Promise<string> {
    const appointment = await prisma.appointment.create({
      data: {
        patientId: params.patientId,
        doctorId,
        type: 'SESSION',
        scheduledAt: params.scheduledAt,
        bookingSource: 'TELEGRAM',
        bookingReferenceCode: params.referenceCode,
      },
      select: { id: true },
    });
    return appointment.id;
  }

  async function deleteTestRows(): Promise<void> {
    // Messages ride the conversation's `onDelete: Cascade`, so they are not
    // deleted separately.
    await prisma.conversation.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
    await prisma.channelPatientLink.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
    await prisma.prescription.deleteMany({
      where: { patient: { mrn: { startsWith: TEST_MARKER } } },
    });
    await prisma.appointment.deleteMany({
      where: { bookingReferenceCode: { startsWith: TEST_MARKER } },
    });
    await prisma.patientProfile.deleteMany({ where: { mrn: { startsWith: TEST_MARKER } } });
    await prisma.doctorProfile.deleteMany({ where: { licenseNumber: { startsWith: TEST_MARKER } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    await deleteTestRows();

    const adminUser = await prisma.user.create({
      data: { email: `${TEST_MARKER}@example.test`, passwordHash: '!no-login' },
      select: { id: true },
    });
    adminUserId = adminUser.id;
    (actor as { sub: string }).sub = adminUserId;

    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Umum` },
      select: { id: true },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-license`,
        fullName: `${TEST_MARKER} dokter`,
        specialtyId: specialty.id,
      },
      select: { id: true },
    });
    doctorId = doctor.id;

    adminConversationRepository = new AdminConversationRepository(prisma);
    arrivalRepository = new ChannelArrivalRepository(prisma);
    arrivalService = new ChannelArrivalService(
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' }),
      arrivalRepository,
    );
    csAdminService = new CsAdminService(
      adminConversationRepository,
      new HandoffService(
        new ConversationRepository(prisma),
        new NotificationService(new NotificationRepository(prisma)),
      ),
      { sendMessage: jest.fn() } as unknown as OutboundMessageDispatcherService,
    );
  });

  afterAll(async () => {
    await deleteTestRows();
    await prisma.$disconnect();
  });

  describe('the draft-patient merge (§5.2)', () => {
    it('moves the booking, the chat link, and retires the draft', async () => {
      const draftId = await createPatient({ suffix: 'merge-draft', source: 'CHANNEL_BOOKING' });
      const targetId = await createPatient({ suffix: 'merge-target', source: 'FRONT_DESK' });
      const appointmentId = await createChannelAppointment({
        patientId: draftId,
        scheduledAt: new Date('2026-09-01T02:00:00.000Z'),
        referenceCode: `${TEST_MARKER}-merge`,
      });
      await prisma.channelPatientLink.create({
        data: {
          channel: 'TELEGRAM',
          externalChatId: `${TEST_MARKER}-merge-chat`,
          phoneNumber: '628121000009',
          fullName: `${TEST_MARKER} merge-draft`,
          patientId: draftId,
        },
      });

      const result = await arrivalService.mergeDraftPatient(
        draftId,
        { targetPatientId: targetId },
        actor,
      );

      expect(result).toMatchObject({ movedAppointments: 1, movedChannelLinks: 1 });
      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { patientId: true },
      });
      expect(appointment.patientId).toBe(targetId);
      // The link has to follow, or the next booking from this chat creates a
      // second draft and the merge has to be repeated at every visit.
      const link = await prisma.channelPatientLink.findFirstOrThrow({
        where: { externalChatId: `${TEST_MARKER}-merge-chat` },
        select: { patientId: true },
      });
      expect(link.patientId).toBe(targetId);
      const draft = await prisma.patientProfile.findUniqueOrThrow({
        where: { id: draftId },
        select: { deletedAt: true, isActive: true, mrn: true },
      });
      // Soft-deleted, never removed: the MRN was quoted to a customer and the
      // row carries the privacy-notice record the channel deferred.
      expect(draft.deletedAt).not.toBeNull();
      expect(draft.isActive).toBe(false);
      expect(draft.mrn).toBe(`${TEST_MARKER}-merge-draft`);
    });

    it('leaves everything untouched when the draft has clinical history', async () => {
      const draftId = await createPatient({ suffix: 'clinical-draft', source: 'CHANNEL_BOOKING' });
      const targetId = await createPatient({ suffix: 'clinical-target', source: 'FRONT_DESK' });
      const appointmentId = await createChannelAppointment({
        patientId: draftId,
        scheduledAt: new Date('2026-09-01T02:00:00.000Z'),
        referenceCode: `${TEST_MARKER}-clinical`,
      });
      await prisma.prescription.create({ data: { patientId: draftId, doctorId } });

      await expect(
        arrivalService.mergeDraftPatient(draftId, { targetPatientId: targetId }, actor),
      ).rejects.toThrow();

      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { patientId: true },
      });
      expect(appointment.patientId).toBe(draftId);
      const draft = await prisma.patientProfile.findUniqueOrThrow({
        where: { id: draftId },
        select: { deletedAt: true },
      });
      expect(draft.deletedAt).toBeNull();

      await prisma.prescription.deleteMany({ where: { patientId: draftId } });
    });
  });

  describe('the arrival worklist', () => {
    it('lists a verified customer’s chat booking even though the patient is not a draft', async () => {
      const patientId = await createPatient({ suffix: 'verified', source: 'FRONT_DESK' });
      await createChannelAppointment({
        patientId,
        scheduledAt: new Date('2026-09-02T02:00:00.000Z'),
        referenceCode: `${TEST_MARKER}-verified`,
      });

      const result = await arrivalService.listArrivals({
        from: '2026-09-02',
        to: '2026-09-02',
        limit: 25,
      });

      const row = result.items.find(
        (item) => item.bookingReferenceCode === `${TEST_MARKER}-verified`,
      );
      // Provenance belongs to the booking, not the person: keying the query
      // off `PatientProfile.source` would call this a walk-in and drop it.
      expect(row).toBeDefined();
      expect(row?.patientIsDraft).toBe(false);
    });

    it('flags a chat-created draft and names what the desk has to ask for', async () => {
      const draftId = await createPatient({ suffix: 'worklist-draft', source: 'CHANNEL_BOOKING' });
      await createChannelAppointment({
        patientId: draftId,
        scheduledAt: new Date('2026-09-02T03:00:00.000Z'),
        referenceCode: `${TEST_MARKER}-worklist`,
      });

      const result = await arrivalService.listArrivals({
        from: '2026-09-02',
        to: '2026-09-02',
        limit: 25,
      });

      const row = result.items.find(
        (item) => item.bookingReferenceCode === `${TEST_MARKER}-worklist`,
      );
      expect(row?.patientIsDraft).toBe(true);
      expect(row?.missingFields).toEqual(
        expect.arrayContaining(['dateOfBirth', 'address', 'nik', 'bpjsNumber']),
      );
    });
  });

  describe('the inbox', () => {
    it('pages without repeating or skipping conversations that share a timestamp', async () => {
      const sharedInstant = new Date('2026-09-03T04:00:00.000Z');
      const ids = await Promise.all([
        createConversation({ suffix: 'page-a', lastMessageAt: sharedInstant }),
        createConversation({ suffix: 'page-b', lastMessageAt: sharedInstant }),
        createConversation({ suffix: 'page-c', lastMessageAt: sharedInstant }),
      ]);

      const firstPage = await adminConversationRepository.listConversations({
        search: TEST_MARKER,
        limit: 2,
      });
      const secondPage = await adminConversationRepository.listConversations({
        search: TEST_MARKER,
        limit: 2,
        ...(firstPage.nextCursor === null ? {} : { cursor: firstPage.nextCursor }),
      });

      const paged = [...firstPage.items, ...secondPage.items].map((item) => item.id);
      // Ordering by activity while paging by id is only correct if the
      // tiebreak holds, and a burst of messages makes shared timestamps the
      // normal case rather than an edge one.
      expect(new Set(paged).size).toBe(paged.length);
      expect(paged).toEqual(expect.arrayContaining(ids));
    });

    it('counts the handoff queue and reports the oldest wait', async () => {
      await createConversation({
        suffix: 'queue-old',
        lastMessageAt: new Date('2026-09-03T01:00:00.000Z'),
        state: 'NEEDS_HUMAN',
      });
      await createConversation({
        suffix: 'queue-new',
        lastMessageAt: new Date('2026-09-03T05:00:00.000Z'),
        state: 'NEEDS_HUMAN',
      });

      const summary = await csAdminService.getHandoffSummary();

      expect(summary.needsHumanCount).toBeGreaterThanOrEqual(2);
      expect(summary.oldestWaitingSince).not.toBeNull();
    });

    it('drops a blocked conversation out of the queue counts', async () => {
      const conversationId = await createConversation({
        suffix: 'queue-blocked',
        lastMessageAt: new Date('2026-09-03T00:00:00.000Z'),
        state: 'NEEDS_HUMAN',
      });

      const before = await csAdminService.getHandoffSummary();
      await csAdminService.blockConversation(conversationId, {}, actor);
      const after = await csAdminService.getHandoffSummary();

      // An admin working the queue must not be handed a conversation the
      // clinic has already decided to stop answering.
      expect(after.needsHumanCount).toBe(before.needsHumanCount - 1);
    });

    it('keeps an admin reply in the transcript with its author', async () => {
      const conversationId = await createConversation({
        suffix: 'reply',
        lastMessageAt: new Date('2026-09-03T06:00:00.000Z'),
        state: 'NEEDS_HUMAN',
      });

      await csAdminService.replyToConversation(
        conversationId,
        { text: 'Selamat siang, kami bantu ya.' },
        actor,
      );

      const transcript = await csAdminService.getTranscript(conversationId, { limit: 10 });
      expect(transcript.items[0]).toMatchObject({
        role: 'ADMIN',
        content: 'Selamat siang, kami bantu ya.',
        authorUserId: adminUserId,
        authorEmail: `${TEST_MARKER}@example.test`,
      });
      // Replying is taking over: the bot must not answer the next message over
      // the top of a person.
      expect(transcript.conversation.state).toBe('HUMAN_ACTIVE');
    });
  });
});
