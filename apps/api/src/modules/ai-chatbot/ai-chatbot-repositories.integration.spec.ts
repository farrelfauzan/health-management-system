import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AiProviderCryptoService } from '../../common/crypto/ai-provider-crypto.service';
import { AiChatbotError } from './ai-chatbot.error';
import { AiProviderConfigRepository } from './repository/ai-provider-config.repository';
import { ChatRepository } from './repository/chat.repository';

/**
 * The P13-T03 repository guarantees that only hold against real Postgres: the
 * seal-on-write / reveal-on-active-connection encryption boundary, the
 * transactional active-slot swap under the P13-T01 partial unique index, and
 * the ownership filters that make another user's session id read as "not
 * found". Rows are namespaced by a fixed marker and removed around each run
 * so a shared dev database is never left with test residue.
 */
describe('AI chatbot repositories against Postgres', () => {
  const TEST_MARKER = 'p13-t03-repo-spec';
  const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 0x2b).toString('base64');
  const PLAINTEXT_API_KEY = `${TEST_MARKER}-sk-abc123wxyz`;

  let prisma: PrismaService;
  let configRepository: AiProviderConfigRepository;
  let chatRepository: ChatRepository;
  let preexistingActiveConfigId: string | null = null;

  function buildConfigRepository(env: Record<string, string>): AiProviderConfigRepository {
    return new AiProviderConfigRepository(prisma, new AiProviderCryptoService(new ConfigService(env)));
  }

  async function createUser(suffix: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${TEST_MARKER}-${suffix}@example.test`,
        passwordHash: `${TEST_MARKER}-hash`,
      },
    });
    return user.id;
  }

  async function deleteTestRows(): Promise<void> {
    await prisma.chatMessage.deleteMany({ where: { content: { startsWith: TEST_MARKER } } });
    await prisma.chatSession.deleteMany({ where: { providerKey: { startsWith: TEST_MARKER } } });
    await prisma.aiProviderConfig.deleteMany({
      where: { displayName: { startsWith: TEST_MARKER } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    configRepository = buildConfigRepository({ AI_PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
    chatRepository = new ChatRepository(prisma);
    // The active slot is global — a partial unique index allows exactly one
    // active row — so activating a test config necessarily deactivates a real
    // one. On a shared dev database that silently switches the clinic's
    // chatbot off, which is the opposite of the namespacing this spec
    // promises, so remember the incumbent and put it back at the end.
    preexistingActiveConfigId =
      (await prisma.aiProviderConfig.findFirst({ where: { isActive: true, deletedAt: null } }))
        ?.id ?? null;
    await deleteTestRows();
  });

  afterEach(async () => {
    await deleteTestRows();
  });

  afterAll(async () => {
    if (preexistingActiveConfigId !== null) {
      await configRepository.activateConfig(preexistingActiveConfigId);
    }
    await prisma.$disconnect();
  });

  describe('AiProviderConfigRepository', () => {
    it('seals the API key on create and never exposes it in the record', async () => {
      const actualRecord = await configRepository.createConfig({
        providerKind: 'DEEPSEEK',
        displayName: `${TEST_MARKER} DeepSeek`,
        apiKey: PLAINTEXT_API_KEY,
        defaultModel: 'deepseek-chat',
      });

      const storedRow = await prisma.aiProviderConfig.findUniqueOrThrow({
        where: { id: actualRecord.id },
      });
      expect(storedRow.apiKeyCiphertext).not.toContain(PLAINTEXT_API_KEY);
      expect(actualRecord.hasApiKey).toBe(true);
      expect(actualRecord.apiKeyHint).toBe('wxyz');
      expect(actualRecord.isActive).toBe(false);
      expect(JSON.stringify(actualRecord)).not.toContain(PLAINTEXT_API_KEY);
    });

    it('round-trips the key through the active connection', async () => {
      const created = await configRepository.createConfig({
        providerKind: 'OPENAI',
        displayName: `${TEST_MARKER} OpenAI`,
        apiKey: PLAINTEXT_API_KEY,
        defaultModel: 'gpt-4o-mini',
      });
      await configRepository.activateConfig(created.id);

      const actualConnection = await configRepository.getActiveConnection();

      expect(actualConnection?.configId).toBe(created.id);
      expect(actualConnection?.apiKey).toBe(PLAINTEXT_API_KEY);
      expect(actualConnection?.model).toBe('gpt-4o-mini');
      expect(actualConnection?.isEnabled).toBe(true);
    });

    it('stores a keyless Ollama config without touching crypto', async () => {
      // A keyless config must work on a deployment that has no encryption key
      // at all — the unconfigured-crypto repository proves nothing sealed.
      const unconfiguredRepository = buildConfigRepository({});

      const created = await unconfiguredRepository.createConfig({
        providerKind: 'OLLAMA',
        displayName: `${TEST_MARKER} Ollama`,
        defaultModel: 'llama3.2',
        baseUrl: 'http://127.0.0.1:11434/v1',
      });
      await unconfiguredRepository.activateConfig(created.id);

      const actualConnection = await unconfiguredRepository.getActiveConnection();
      expect(created.hasApiKey).toBe(false);
      expect(created.apiKeyHint).toBe('');
      expect(actualConnection?.apiKey).toBeNull();
      expect(actualConnection?.baseUrl).toBe('http://127.0.0.1:11434/v1');
    });

    it('refuses to store a key when the encryption key is not set', async () => {
      const unconfiguredRepository = buildConfigRepository({});

      const actualError = await unconfiguredRepository
        .createConfig({
          providerKind: 'OPENAI',
          displayName: `${TEST_MARKER} rejected`,
          apiKey: PLAINTEXT_API_KEY,
          defaultModel: 'gpt-4o-mini',
        })
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(AiChatbotError);
      expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
    });

    it('keeps the stored ciphertext when an update omits the key and rotates it when present', async () => {
      const created = await configRepository.createConfig({
        providerKind: 'DEEPSEEK',
        displayName: `${TEST_MARKER} rotating`,
        apiKey: PLAINTEXT_API_KEY,
        defaultModel: 'deepseek-chat',
      });
      const initialRow = await prisma.aiProviderConfig.findUniqueOrThrow({
        where: { id: created.id },
      });

      await configRepository.updateConfig(created.id, { displayName: `${TEST_MARKER} renamed` });
      const afterRename = await prisma.aiProviderConfig.findUniqueOrThrow({
        where: { id: created.id },
      });
      const rotated = await configRepository.updateConfig(created.id, {
        apiKey: `${TEST_MARKER}-sk-new-key-9876`,
      });
      const afterRotate = await prisma.aiProviderConfig.findUniqueOrThrow({
        where: { id: created.id },
      });

      expect(afterRename.apiKeyCiphertext).toBe(initialRow.apiKeyCiphertext);
      expect(afterRename.displayName).toBe(`${TEST_MARKER} renamed`);
      expect(afterRotate.apiKeyCiphertext).not.toBe(initialRow.apiKeyCiphertext);
      expect(rotated.apiKeyHint).toBe('9876');
    });

    it('swaps the active slot atomically between configs', async () => {
      const first = await configRepository.createConfig({
        providerKind: 'DEEPSEEK',
        displayName: `${TEST_MARKER} first`,
        apiKey: PLAINTEXT_API_KEY,
        defaultModel: 'deepseek-chat',
      });
      const second = await configRepository.createConfig({
        providerKind: 'ANTHROPIC',
        displayName: `${TEST_MARKER} second`,
        apiKey: PLAINTEXT_API_KEY,
        defaultModel: 'claude-sonnet-4-20250514',
      });

      await configRepository.activateConfig(first.id);
      // The swap must survive the partial unique index that rejects a second
      // active row — deactivate and claim happen in one transaction.
      await configRepository.activateConfig(second.id);

      const actualActive = await configRepository.findActiveConfig();
      const actualFirst = await configRepository.findConfigById(first.id);
      expect(actualActive?.id).toBe(second.id);
      expect(actualFirst?.isActive).toBe(false);
    });

    it('releases the active slot on soft delete and hides the row from every read', async () => {
      const created = await configRepository.createConfig({
        providerKind: 'DEEPSEEK',
        displayName: `${TEST_MARKER} retiring`,
        apiKey: PLAINTEXT_API_KEY,
        defaultModel: 'deepseek-chat',
      });
      await configRepository.activateConfig(created.id);

      await configRepository.softDeleteConfig(created.id);

      expect(await configRepository.findConfigById(created.id)).toBeNull();
      expect(await configRepository.findActiveConfig()).toBeNull();
      expect(await configRepository.getActiveConnection()).toBeNull();
      // Scoped to this spec's own rows: a shared dev database legitimately
      // holds a clinic's real configurations, and their presence is not a
      // failure of soft delete.
      const actualListed = await configRepository.listConfigs();
      expect(actualListed.filter((record) => record.displayName.startsWith(TEST_MARKER))).toEqual(
        [],
      );
    });
  });

  describe('ChatRepository ownership filters', () => {
    it("resolves another user's session id as not found, for reads and deletes alike", async () => {
      const ownerId = await createUser('owner');
      const strangerId = await createUser('stranger');
      const session = await chatRepository.createSession({
        ownerUserId: ownerId,
        channel: 'PATIENT',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });

      const actualForeignRead = await chatRepository.findSessionForOwner(session.id, strangerId);
      const actualForeignDelete = await chatRepository.softDeleteSessionForOwner(
        session.id,
        strangerId,
      );
      const actualOwnRead = await chatRepository.findSessionForOwner(session.id, ownerId);

      expect(actualForeignRead).toBeNull();
      expect(actualForeignDelete).toBe(false);
      // The failed foreign delete must not have touched the row.
      expect(actualOwnRead?.id).toBe(session.id);
    });

    it("lists only the owner's live sessions, while the support view sees everyone", async () => {
      const ownerId = await createUser('owner');
      const otherId = await createUser('other');
      const ownSession = await chatRepository.createSession({
        ownerUserId: ownerId,
        channel: 'PATIENT',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });
      const deletedSession = await chatRepository.createSession({
        ownerUserId: ownerId,
        channel: 'PATIENT',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });
      await chatRepository.createSession({
        ownerUserId: otherId,
        channel: 'DOCTOR',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });
      await chatRepository.softDeleteSessionForOwner(deletedSession.id, ownerId);

      const actualOwn = await chatRepository.listSessionsForOwner({
        ownerUserId: ownerId,
        limit: 10,
      });
      const actualAll = await chatRepository.listAllSessions({ limit: 10 });
      const actualDoctorChannel = await chatRepository.listAllSessions({
        channel: 'DOCTOR',
        limit: 10,
      });

      expect(actualOwn.items.map((item) => item.id)).toEqual([ownSession.id]);
      expect(actualAll.items).toHaveLength(2);
      expect(actualDoctorChannel.items.map((item) => item.ownerUserId)).toEqual([otherId]);
    });

    it('pages sessions by cursor without overlap or gaps', async () => {
      const ownerId = await createUser('owner');
      for (let i = 0; i < 5; i += 1) {
        await chatRepository.createSession({
          ownerUserId: ownerId,
          channel: 'PATIENT',
          providerKey: `${TEST_MARKER}-config-1`,
          providerKind: 'DEEPSEEK',
          title: `session ${i}`,
        });
      }

      const firstPage = await chatRepository.listSessionsForOwner({
        ownerUserId: ownerId,
        limit: 2,
      });
      const secondPage = await chatRepository.listSessionsForOwner({
        ownerUserId: ownerId,
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      });
      const thirdPage = await chatRepository.listSessionsForOwner({
        ownerUserId: ownerId,
        cursor: secondPage.nextCursor ?? undefined,
        limit: 2,
      });

      const seenIds = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map(
        (item) => item.id,
      );
      expect(firstPage.nextCursor).not.toBeNull();
      expect(new Set(seenIds).size).toBe(5);
      expect(thirdPage.nextCursor).toBeNull();
    });

    it('appends messages and reads them back in transcript order', async () => {
      const ownerId = await createUser('owner');
      const session = await chatRepository.createSession({
        ownerUserId: ownerId,
        channel: 'PATIENT',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });
      // The exchange stamps its own turn order — appended back-to-back, the
      // two turns land inside one millisecond and would otherwise tie.
      const exchangeStartedAt = new Date();
      await chatRepository.appendMessage({
        sessionId: session.id,
        authorUserId: ownerId,
        actor: 'USER',
        content: `${TEST_MARKER} kapan jam buka klinik?`,
        createdAt: exchangeStartedAt,
      });
      await chatRepository.appendMessage({
        sessionId: session.id,
        actor: 'ASSISTANT',
        content: `${TEST_MARKER} Klinik buka pukul 08.00-20.00 WIB.`,
        createdAt: new Date(exchangeStartedAt.getTime() + 1),
        providerKind: 'DEEPSEEK',
        providerRequestId: 'req_123',
        providerModel: 'deepseek-chat',
        providerLatencyMs: 850,
        disclaimerShown: true,
        safetyTags: [],
      });

      const actualPage = await chatRepository.listMessagesForSession({
        sessionId: session.id,
        limit: 10,
      });

      expect(actualPage.items.map((item) => item.actor)).toEqual(['USER', 'ASSISTANT']);
      expect(actualPage.items[1]?.authorUserId).toBeNull();
      expect(actualPage.items[1]?.disclaimerShown).toBe(true);
      expect(actualPage.items[1]?.providerRequestId).toBe('req_123');
      expect(actualPage.items[1]?.safetyTags).toEqual([]);
      expect(actualPage.nextCursor).toBeNull();
    });

    it('pages a transcript forward by cursor', async () => {
      const ownerId = await createUser('owner');
      const session = await chatRepository.createSession({
        ownerUserId: ownerId,
        channel: 'PATIENT',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });
      const transcriptStartedAt = new Date();
      for (let i = 0; i < 3; i += 1) {
        await chatRepository.appendMessage({
          sessionId: session.id,
          authorUserId: ownerId,
          actor: 'USER',
          content: `${TEST_MARKER} turn ${i}`,
          createdAt: new Date(transcriptStartedAt.getTime() + i),
        });
      }

      const firstPage = await chatRepository.listMessagesForSession({
        sessionId: session.id,
        limit: 2,
      });
      const secondPage = await chatRepository.listMessagesForSession({
        sessionId: session.id,
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      });

      expect(firstPage.items.map((item) => item.content)).toEqual([
        `${TEST_MARKER} turn 0`,
        `${TEST_MARKER} turn 1`,
      ]);
      expect(secondPage.items.map((item) => item.content)).toEqual([`${TEST_MARKER} turn 2`]);
      expect(secondPage.nextCursor).toBeNull();
    });

    it("keeps a soft-deleted session's transcript readable for audit", async () => {
      const ownerId = await createUser('owner');
      const session = await chatRepository.createSession({
        ownerUserId: ownerId,
        channel: 'PATIENT',
        providerKey: `${TEST_MARKER}-config-1`,
        providerKind: 'DEEPSEEK',
      });
      await chatRepository.appendMessage({
        sessionId: session.id,
        authorUserId: ownerId,
        actor: 'USER',
        content: `${TEST_MARKER} preserved turn`,
      });

      await chatRepository.softDeleteSessionForOwner(session.id, ownerId);

      const actualMessages = await chatRepository.listMessagesForSession({
        sessionId: session.id,
        limit: 10,
      });
      expect(await chatRepository.findSessionForOwner(session.id, ownerId)).toBeNull();
      expect(actualMessages.items).toHaveLength(1);
    });
  });
});
