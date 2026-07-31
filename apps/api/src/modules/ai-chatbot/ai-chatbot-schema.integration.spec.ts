import { ConfigService } from '@nestjs/config';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The P13-T01 schema guarantees that live behind hand-written SQL or referential
 * actions, and so cannot be proven by any unit test: exactly one active AI
 * provider config, chat transcripts that survive their author, and messages
 * that follow their session. Everything here runs against real Postgres.
 *
 * Rows are namespaced by a fixed marker and removed around each run so a shared
 * dev database is never left with test residue.
 */
describe('AI chatbot schema against Postgres', () => {
  const TEST_MARKER = 'p13-t01-schema-spec';

  let prisma: PrismaService;

  function buildConfigData(overrides: {
    displayName: string;
    isActive: boolean;
  }): Prisma.AiProviderConfigUncheckedCreateInput {
    return {
      // Null is the shipped single-facility case, and the one the partial
      // unique index has to cover through its COALESCE.
      facilityId: null,
      providerKind: 'DEEPSEEK',
      displayName: overrides.displayName,
      apiKeyCiphertext: `${TEST_MARKER}-ciphertext`,
      apiKeyHint: 'x7Kp',
      defaultModel: 'deepseek-chat',
      isActive: overrides.isActive,
    };
  }

  async function deleteTestRows(): Promise<void> {
    await prisma.chatMessage.deleteMany({ where: { content: { startsWith: TEST_MARKER } } });
    await prisma.chatSession.deleteMany({ where: { providerKey: { startsWith: TEST_MARKER } } });
    await prisma.aiProviderConfig.deleteMany({
      where: { apiKeyCiphertext: { startsWith: TEST_MARKER } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    await deleteTestRows();
  });

  afterEach(async () => {
    await deleteTestRows();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AiProviderConfig', () => {
    it('refuses a second active config for the same facility', async () => {
      await prisma.aiProviderConfig.create({
        data: buildConfigData({ displayName: 'Clinic DeepSeek', isActive: true }),
      });

      // Two live credential sets means the resolver picks arbitrarily which one
      // answers the next patient — the partial unique index is what stops it.
      const actualSecondActive = await prisma.aiProviderConfig
        .create({
          data: buildConfigData({ displayName: 'Clinic DeepSeek (duplicate)', isActive: true }),
        })
        .catch((err: unknown) => err);

      expect(actualSecondActive).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((actualSecondActive as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    });

    it('allows staging inactive configs alongside the active one', async () => {
      await prisma.aiProviderConfig.create({
        data: buildConfigData({ displayName: 'Clinic DeepSeek', isActive: true }),
      });
      await prisma.aiProviderConfig.create({
        data: buildConfigData({ displayName: 'Clinic Claude (staged)', isActive: false }),
      });

      const actualCount = await prisma.aiProviderConfig.count({
        where: { apiKeyCiphertext: { startsWith: TEST_MARKER } },
      });

      expect(actualCount).toBe(2);
    });

    it('frees the active slot once the current config is soft-deleted', async () => {
      const inputRetiredConfig = await prisma.aiProviderConfig.create({
        data: buildConfigData({ displayName: 'Clinic DeepSeek', isActive: true }),
      });
      await prisma.softDelete(prisma.aiProviderConfig, { id: inputRetiredConfig.id });

      // Soft delete is how a config is retired, so a retired row must not keep
      // holding the single active slot hostage.
      const actualReplacement = await prisma.aiProviderConfig.create({
        data: buildConfigData({ displayName: 'Clinic Claude', isActive: true }),
      });

      expect(actualReplacement.isActive).toBe(true);
    });
  });

  describe('ChatSession and ChatMessage', () => {
    async function createOwnedSession(): Promise<{ userId: string; sessionId: string }> {
      const owner = await prisma.user.create({
        data: {
          email: `${TEST_MARKER}-owner@example.test`,
          passwordHash: `${TEST_MARKER}-hash`,
        },
      });
      const session = await prisma.chatSession.create({
        data: {
          ownerUserId: owner.id,
          channel: 'PATIENT',
          providerKey: `${TEST_MARKER}-provider-key`,
          providerKind: 'DEEPSEEK',
        },
      });

      return { userId: owner.id, sessionId: session.id };
    }

    it('keeps the transcript when the account that owns it is deleted', async () => {
      const { userId } = await createOwnedSession();

      // A session records what a patient was told; onDelete Restrict is what
      // makes account deletion unable to quietly erase that history.
      const actualUserDelete = prisma.user.delete({ where: { id: userId } });

      await expect(actualUserDelete).rejects.toThrow();
    });

    it('removes a session’s messages when the session row itself is deleted', async () => {
      const { sessionId } = await createOwnedSession();
      await prisma.chatMessage.create({
        data: {
          sessionId,
          actor: 'ASSISTANT',
          content: `${TEST_MARKER} assistant turn`,
          disclaimerShown: true,
        },
      });

      await prisma.chatSession.delete({ where: { id: sessionId } });

      const actualOrphanCount = await prisma.chatMessage.count({ where: { sessionId } });

      expect(actualOrphanCount).toBe(0);
    });

    it('detaches a deleted author instead of dropping their turn', async () => {
      const { sessionId } = await createOwnedSession();
      const author = await prisma.user.create({
        data: {
          email: `${TEST_MARKER}-author@example.test`,
          passwordHash: `${TEST_MARKER}-hash`,
        },
      });
      const inputMessage = await prisma.chatMessage.create({
        data: {
          sessionId,
          authorUserId: author.id,
          actor: 'USER',
          content: `${TEST_MARKER} user turn`,
        },
      });

      await prisma.user.delete({ where: { id: author.id } });

      const actualMessage = await prisma.chatMessage.findUnique({ where: { id: inputMessage.id } });

      // Attribution can be erased, the turn itself cannot: the transcript stays
      // readable as a record of what the provider was shown.
      expect(actualMessage?.content).toBe(`${TEST_MARKER} user turn`);
      expect(actualMessage?.authorUserId).toBeNull();
    });
  });
});
