import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChannelMetricsRepository } from './repository/channel-metrics.repository';
import { ChannelOtpChallengeRepository } from './repository/channel-otp-challenge.repository';
import { ConversationRepository } from './repository/conversation.repository';
import { ChannelMetricsService } from './service/channel-metrics.service';

/**
 * The `PCS-T11` guarantees that only exist in SQL.
 *
 * Two of them earn this file, and both are counts *across* rows that a mocked
 * repository proves nothing about:
 *
 * **Enumeration flagging** (§8.3) is the acceptance criterion, and its whole
 * point is that it counts **distinct chats** against one patient record. The
 * per-chat quota that shipped at `PCS-T07` is bounded by a conversation id and
 * a second chat resets it for free — so the only version of this test worth
 * writing is one that opens several conversations and asks the database.
 *
 * **The daily LLM budget** counts `BOT` turns clinic-wide. A mock would happily
 * return a number; what has to be true is that the count excludes every
 * locally-answered `SYSTEM` template, because those never reached a provider
 * and must not spend the budget that exists to bound the bill.
 *
 * Rows are namespaced by a fixed marker and removed around each run so a shared
 * dev database is never left with test residue.
 */
describe('customer-service abuse controls against Postgres', () => {
  const TEST_MARKER = 'pcs-t11-spec';

  let prisma: PrismaService;
  let challengeRepository: ChannelOtpChallengeRepository;
  let conversationRepository: ConversationRepository;
  let metricsService: ChannelMetricsService;
  let patientId: string;

  async function createConversation(suffix: string): Promise<string> {
    const conversation = await prisma.conversation.create({
      data: {
        channel: 'TELEGRAM',
        externalChatId: `${TEST_MARKER}-${suffix}`,
        senderDisplayName: `${TEST_MARKER} customer`,
        lastMessageAt: new Date(),
      },
      select: { id: true },
    });
    return conversation.id;
  }

  /** A challenge that was opened against the record and then spent unproven. */
  async function createFailedChallenge(conversationId: string): Promise<void> {
    await prisma.channelOtpChallenge.create({
      data: {
        conversationId,
        method: 'OTP',
        patientId,
        codeHash: 'irrelevant-for-this-count',
        attemptsUsed: 3,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: new Date(),
        patientFullName: `${TEST_MARKER} claimed`,
        phoneNumber: '628123456789',
        doctorId: patientId,
        scheduleId: patientId,
        sessionDate: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
  }

  async function deleteTestRows(): Promise<void> {
    await prisma.channelOtpChallenge.deleteMany({
      where: { patientFullName: { startsWith: TEST_MARKER } },
    });
    await prisma.conversation.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
    await prisma.patientProfile.deleteMany({ where: { mrn: { startsWith: TEST_MARKER } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    await deleteTestRows();
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-target`,
        fullName: `${TEST_MARKER} target`,
        phoneNumber: '628123456789',
        dateOfBirth: new Date('1990-05-12T00:00:00.000Z'),
        address: 'Jakarta',
      },
      select: { id: true },
    });
    patientId = patient.id;
    challengeRepository = new ChannelOtpChallengeRepository(
      prisma,
      new NationalIdentifierCryptoService(new ConfigService()),
    );
    conversationRepository = new ConversationRepository(prisma);
    metricsService = new ChannelMetricsService(
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' }),
      new ChannelMetricsRepository(prisma),
    );
  });

  afterAll(async () => {
    await deleteTestRows();
    await prisma.$disconnect();
  });

  describe('enumeration flagging (§8.3)', () => {
    it('counts distinct chats probing one record, not challenges', async () => {
      const conversationId = await createConversation('enum-single');
      await createFailedChallenge(conversationId);
      await createFailedChallenge(conversationId);
      await createFailedChallenge(conversationId);

      const actual = await challengeRepository.countChatsFailingAgainstPatient({
        patientId,
        since: new Date(Date.now() - 86_400_000),
      });

      // One determined chat is what the per-chat quota already bounds. This
      // count exists for the other shape — many chats, one record — so three
      // failures from one conversation must read as one.
      expect(actual).toBe(1);
    });

    it('rises as a second and third chat probe the same record', async () => {
      const second = await createConversation('enum-second');
      await createFailedChallenge(second);
      const third = await createConversation('enum-third');
      await createFailedChallenge(third);

      const actual = await challengeRepository.countChatsFailingAgainstPatient({
        patientId,
        since: new Date(Date.now() - 86_400_000),
      });

      // Three distinct chats against one registered number, which is what
      // walking the registry looks like from the inside — and what the
      // per-chat quota cannot see, because each of these chats used one of
      // its own three.
      expect(actual).toBe(3);
    });

    it('ignores a challenge that is still live', async () => {
      const pending = await createConversation('enum-pending');
      await prisma.channelOtpChallenge.create({
        data: {
          conversationId: pending,
          method: 'OTP',
          patientId,
          codeHash: 'still-open',
          attemptsUsed: 0,
          expiresAt: new Date(Date.now() + 300_000),
          patientFullName: `${TEST_MARKER} claimed`,
          phoneNumber: '628123456789',
          doctorId: patientId,
          scheduleId: patientId,
          sessionDate: new Date('2026-09-01T00:00:00.000Z'),
        },
      });

      const actual = await challengeRepository.countChatsFailingAgainstPatient({
        patientId,
        since: new Date(Date.now() - 86_400_000),
      });

      // A customer part-way through typing a code has not failed anything.
      expect(actual).toBe(3);
    });

    it('forgets probes older than the window', async () => {
      const actual = await challengeRepository.countChatsFailingAgainstPatient({
        patientId,
        since: new Date(Date.now() + 60_000),
      });

      expect(actual).toBe(0);
    });
  });

  describe('the daily LLM budget (§8.3)', () => {
    it('counts provider replies and ignores locally-answered templates', async () => {
      const conversationId = await createConversation('budget');
      const since = new Date(Date.now() - 60_000);
      const before = await conversationRepository.countProviderRepliesSince(since);

      await conversationRepository.appendMessage({
        conversationId,
        role: 'BOT',
        content: 'a model composed this',
        safetyTags: [],
      });
      await conversationRepository.appendMessage({
        conversationId,
        role: 'SYSTEM',
        content: 'a template answered this',
        safetyTags: ['emergency_escalation'],
      });
      await conversationRepository.appendMessage({
        conversationId,
        role: 'CUSTOMER',
        content: 'a customer said this',
        safetyTags: [],
      });

      const after = await conversationRepository.countProviderRepliesSince(since);

      // Exactly one of the three cost money. A budget that counted `SYSTEM`
      // turns would be spent by emergencies and booking confirmations — the
      // replies that exist precisely because they need no provider.
      expect(after - before).toBe(1);
    });
  });

  describe('channel metrics (§8.4)', () => {
    it('reports null rather than zero for a no-hit rate nobody generated', async () => {
      const actual = await metricsService.readMetrics({ days: 14 });

      // Zero would read as "the corpus answered everything". The truth on a
      // clinic with no FAQ documents is that nothing was ever asked of it, and
      // those are opposite conclusions about whether the corpus works.
      expect(actual.faqNoHitRate).toBeNull();
      expect(actual.windowDays).toBe(14);
    });

    it('returns counts alongside every rate', async () => {
      const actual = await metricsService.readMetrics({ days: 14 });

      // A handoff rate of 1.0 is alarming over a hundred conversations and
      // meaningless over one; the dashboard must never show the ratio alone.
      expect(actual.conversationsStarted).toEqual(expect.any(Number));
      expect(actual.inboundMessages).toEqual(expect.any(Number));
      expect(actual.handoffs).toEqual(expect.any(Number));
      expect(actual.from <= actual.to).toBe(true);
    });
  });
});
