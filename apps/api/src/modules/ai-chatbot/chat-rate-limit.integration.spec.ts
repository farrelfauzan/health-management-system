import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ChatRepository } from './repository/chat.repository';
import { SafetyPolicyService } from './service/safety-policy.service';

/**
 * P13-T11 rate-limit load test. The quotas are the only thing standing
 * between one account and an unbounded provider bill, so they are exercised
 * against real Postgres — including under concurrency, where a count-then-
 * check has a race that no sequential test can see.
 *
 * Rows are namespaced by a fixed marker and removed around each run so a
 * shared dev database is never left with test residue.
 */
describe('Chat rate limits against Postgres', () => {
  const TEST_MARKER = 'p13-t11-rate-limit-spec';
  const MESSAGES_PER_HOUR = 5;
  const SESSIONS_PER_DAY = 3;

  let prisma: PrismaService;
  let chatRepository: ChatRepository;
  let safetyPolicyService: SafetyPolicyService;
  let ownerUserId: string;

  async function deleteTestRows(): Promise<void> {
    await prisma.chatMessage.deleteMany({ where: { content: { startsWith: TEST_MARKER } } });
    await prisma.chatSession.deleteMany({ where: { providerKey: { startsWith: TEST_MARKER } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
  }

  async function createSession(): Promise<string> {
    const session = await chatRepository.createSession({
      ownerUserId,
      channel: 'PATIENT',
      providerKey: `${TEST_MARKER}-config`,
      providerKind: 'DEEPSEEK',
    });
    return session.id;
  }

  /** Drives the quota exactly as the orchestration does: one guarded write. */
  async function attemptGuardedTurn(sessionId: string): Promise<'ALLOWED' | 'REFUSED'> {
    const written = await chatRepository.appendUserMessageWithinQuota(
      {
        sessionId,
        authorUserId: ownerUserId,
        actor: 'USER',
        content: `${TEST_MARKER} guarded turn`,
      },
      safetyPolicyService.messageQuota,
    );
    return written === null ? 'REFUSED' : 'ALLOWED';
  }

  async function sendTurns(sessionId: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await chatRepository.appendMessage({
        sessionId,
        authorUserId: ownerUserId,
        actor: 'USER',
        content: `${TEST_MARKER} turn ${index}`,
      });
    }
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    chatRepository = new ChatRepository(prisma);
    safetyPolicyService = new SafetyPolicyService(
      new ConfigService({
        AI_CHAT_RATE_LIMIT_PER_HOUR: String(MESSAGES_PER_HOUR),
        AI_CHAT_MAX_SESSIONS_PER_DAY: String(SESSIONS_PER_DAY),
      }),
    );
    await deleteTestRows();
  });

  beforeEach(async () => {
    await deleteTestRows();
    const owner = await prisma.user.create({
      data: { email: `${TEST_MARKER}@example.test`, passwordHash: `${TEST_MARKER}-hash` },
    });
    ownerUserId = owner.id;
  });

  afterAll(async () => {
    await deleteTestRows();
    await prisma.$disconnect();
  });

  describe('hourly message quota', () => {
    it('admits messages up to the limit and refuses the next one', async () => {
      const sessionId = await createSession();
      await sendTurns(sessionId, MESSAGES_PER_HOUR - 1);

      const actualLastAllowed = await attemptGuardedTurn(sessionId);
      const actualRefused = await attemptGuardedTurn(sessionId);

      expect(actualLastAllowed).toBe('ALLOWED');
      expect(actualRefused).toBe('REFUSED');
    });

    it('counts across sessions, so a second conversation buys no fresh budget', async () => {
      const firstSessionId = await createSession();
      const secondSessionId = await createSession();
      await sendTurns(firstSessionId, 3);
      await sendTurns(secondSessionId, 2);

      expect(await attemptGuardedTurn(firstSessionId)).toBe('REFUSED');
    });

    it('ignores turns older than the window', async () => {
      const sessionId = await createSession();
      const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
      for (let index = 0; index < MESSAGES_PER_HOUR + 5; index += 1) {
        await chatRepository.appendMessage({
          sessionId,
          authorUserId: ownerUserId,
          actor: 'USER',
          content: `${TEST_MARKER} old turn ${index}`,
          createdAt: new Date(twoHoursAgo.getTime() + index),
        });
      }

      expect(await attemptGuardedTurn(sessionId)).toBe('ALLOWED');
    });

    it('does not count assistant or system turns against the user', async () => {
      const sessionId = await createSession();
      for (let index = 0; index < MESSAGES_PER_HOUR + 5; index += 1) {
        await chatRepository.appendMessage({
          sessionId,
          actor: index % 2 === 0 ? 'ASSISTANT' : 'SYSTEM',
          content: `${TEST_MARKER} non-user turn ${index}`,
        });
      }

      expect(await attemptGuardedTurn(sessionId)).toBe('ALLOWED');
    });

    it('counts authored tool SYSTEM turns against the hourly quota', async () => {
      // P15-T04 quota accounting: an executed lookup persists a SYSTEM turn
      // carrying the asking user's id, and each one consumes a slot of the
      // same hourly budget — a message that triggered three lookups cost
      // four. Context-enrichment SYSTEM turns (previous test) carry no
      // author and stay free.
      const sessionId = await createSession();
      for (let index = 0; index < MESSAGES_PER_HOUR; index += 1) {
        await chatRepository.appendMessage({
          sessionId,
          authorUserId: ownerUserId,
          actor: 'SYSTEM',
          content: `${TEST_MARKER} tool turn ${index}`,
        });
      }

      expect(await attemptGuardedTurn(sessionId)).toBe('REFUSED');
    });

    it('lets an emergency through after the quota is exhausted', async () => {
      const sessionId = await createSession();
      await sendTurns(sessionId, MESSAGES_PER_HOUR + 10);

      const actualDecision = safetyPolicyService.evaluateInput('nyeri dada');

      // A quota is an anti-abuse measure; it must never be the reason someone
      // is not shown the ambulance number — and the orchestration routes an
      // escalated turn to the unguarded append for exactly this reason.
      expect(actualDecision.outcome).toBe('ESCALATE');
    });
  });

  describe('daily session quota', () => {
    async function attemptGuardedSession() {
      return chatRepository.createSessionWithinQuota(
        {
          ownerUserId,
          channel: 'PATIENT',
          providerKey: `${TEST_MARKER}-config`,
          providerKind: 'DEEPSEEK',
        },
        safetyPolicyService.sessionQuota,
      );
    }

    it('refuses a new session once the daily limit is reached', async () => {
      for (let index = 0; index < SESSIONS_PER_DAY; index += 1) {
        await createSession();
      }

      expect(await attemptGuardedSession()).toBeNull();
    });

    it('counts soft-deleted sessions, so a delete cannot reset the quota', async () => {
      for (let index = 0; index < SESSIONS_PER_DAY; index += 1) {
        const sessionId = await createSession();
        await chatRepository.softDeleteSessionForOwner(sessionId, ownerUserId);
      }

      expect(await attemptGuardedSession()).toBeNull();
    });
  });

  describe('burst behaviour', () => {
    /**
     * The regression this task exists to prevent. Counting and then inserting
     * as two statements let ten simultaneous requests through a single
     * remaining slot — measured, not theorised. The advisory-locked
     * count-and-insert transaction makes the limit hold exactly, whatever the
     * burst size.
     */
    it('admits exactly the remaining slots under a simultaneous burst', async () => {
      const sessionId = await createSession();
      await sendTurns(sessionId, MESSAGES_PER_HOUR - 1);

      const burstOutcomes = await Promise.all(
        Array.from({ length: 20 }, () => attemptGuardedTurn(sessionId)),
      );

      expect(burstOutcomes.filter((outcome) => outcome === 'ALLOWED')).toHaveLength(1);
      const actualPersisted = await prisma.chatMessage.count({
        where: { authorUserId: ownerUserId, actor: 'USER' },
      });
      expect(actualPersisted).toBe(MESSAGES_PER_HOUR);
    });

    it('holds the session limit under a simultaneous burst too', async () => {
      const burstOutcomes = await Promise.all(
        Array.from({ length: 20 }, () =>
          chatRepository.createSessionWithinQuota(
            {
              ownerUserId,
              channel: 'PATIENT',
              providerKey: `${TEST_MARKER}-config`,
              providerKind: 'DEEPSEEK',
            },
            safetyPolicyService.sessionQuota,
          ),
        ),
      );

      expect(burstOutcomes.filter((session) => session !== null)).toHaveLength(SESSIONS_PER_DAY);
    });
  });
});
