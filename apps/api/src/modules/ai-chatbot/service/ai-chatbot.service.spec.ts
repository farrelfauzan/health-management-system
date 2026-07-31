import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

import { ChatMessageRecord, ChatSessionRecord } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AiChatbotError } from '../ai-chatbot.error';
import { ChatCompletionMessage } from '../infrastructure/ai-provider.types';
import { ChatRepository } from '../repository/chat.repository';
import { AiChatbotService } from './ai-chatbot.service';
import { AiProviderResolverService } from './ai-provider-resolver.service';

describe('AiChatbotService', () => {
  const chatRepositoryMock = {
    createSession: jest.fn(),
    findSessionForOwner: jest.fn(),
    listSessionsForOwner: jest.fn(),
    listAllSessions: jest.fn(),
    softDeleteSessionForOwner: jest.fn(),
    appendMessage: jest.fn(),
    listMessagesForSession: jest.fn(),
  };
  const sendChatCompletionMock = jest.fn();
  const resolveActiveProviderMock = jest.fn();

  const inputActor: CurrentUser = { sub: 'user-patient', email: 'patient@hms.local' };

  function buildService(env: Record<string, string> = { AI_CHAT_ENABLED: 'true' }): AiChatbotService {
    return new AiChatbotService(
      chatRepositoryMock as unknown as ChatRepository,
      { resolveActiveProvider: resolveActiveProviderMock } as unknown as AiProviderResolverService,
      new ConfigService(env),
    );
  }

  function buildSession(overrides: Partial<ChatSessionRecord> = {}): ChatSessionRecord {
    return {
      id: 'session-1',
      ownerUserId: 'user-patient',
      channel: 'PATIENT',
      providerKey: 'config-1',
      providerKind: 'DEEPSEEK',
      providerSessionId: null,
      title: null,
      createdAt: new Date('2026-08-12T04:00:00.000Z'),
      updatedAt: new Date('2026-08-12T04:00:00.000Z'),
      ...overrides,
    };
  }

  function buildMessage(overrides: Partial<ChatMessageRecord> = {}): ChatMessageRecord {
    return {
      id: 'message-1',
      sessionId: 'session-1',
      authorUserId: 'user-patient',
      actor: 'USER',
      content: 'Kapan jam buka klinik?',
      providerKind: null,
      providerRequestId: null,
      providerMessageId: null,
      providerModel: null,
      providerStatusCode: null,
      providerLatencyMs: null,
      disclaimerShown: false,
      safetyTags: [],
      createdAt: new Date('2026-08-12T04:00:00.000Z'),
      ...overrides,
    };
  }

  function stubActiveProvider(): void {
    resolveActiveProviderMock.mockResolvedValue({
      adapter: { supports: () => true, sendChatCompletion: sendChatCompletionMock },
      config: { configId: 'config-1', providerKind: 'DEEPSEEK' },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('stamps the resolved provider onto the session', async () => {
      stubActiveProvider();
      chatRepositoryMock.createSession.mockResolvedValue(buildSession());

      const actualView = await buildService().createSession({ channel: 'PATIENT' }, inputActor);

      expect(chatRepositoryMock.createSession).toHaveBeenCalledWith({
        ownerUserId: 'user-patient',
        channel: 'PATIENT',
        providerKey: 'config-1',
        providerKind: 'DEEPSEEK',
        title: null,
      });
      expect(actualView.providerKind).toBe('DEEPSEEK');
    });

    it('refuses to start a session when the feature flag is off', async () => {
      const actualError = await buildService({})
        .createSession({ channel: 'PATIENT' }, inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(AiChatbotError);
      expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
      expect(chatRepositoryMock.createSession).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    function stubExchange(): void {
      stubActiveProvider();
      chatRepositoryMock.findSessionForOwner.mockResolvedValue(buildSession());
      chatRepositoryMock.appendMessage
        .mockResolvedValueOnce(buildMessage())
        .mockResolvedValueOnce(
          buildMessage({
            id: 'message-2',
            actor: 'ASSISTANT',
            authorUserId: null,
            content: 'Klinik buka pukul 08.00.',
            disclaimerShown: true,
            providerRequestId: 'req-1',
            providerModel: 'deepseek-chat',
          }),
        );
      chatRepositoryMock.listMessagesForSession.mockResolvedValue({
        items: [buildMessage()],
        nextCursor: null,
      });
      sendChatCompletionMock.mockResolvedValue({
        content: 'Klinik buka pukul 08.00.',
        providerKind: 'DEEPSEEK',
        providerRequestId: 'req-1',
        providerMessageId: 'msg-1',
        model: 'deepseek-chat',
        latencyMs: 820,
        rawMetadata: {},
      });
    }

    it('returns both turns with the disclaimer in meta, never in the content', async () => {
      stubExchange();

      const actualResult = await buildService().sendMessage(
        'session-1',
        { content: 'Kapan jam buka klinik?' },
        inputActor,
      );

      expect(actualResult.data.userMessage.actor).toBe('USER');
      expect(actualResult.data.assistantMessage.actor).toBe('ASSISTANT');
      expect(actualResult.meta.disclaimer).toContain('bukan diagnosis medis');
      expect(actualResult.data.assistantMessage.content).not.toContain('bukan diagnosis medis');
      expect(actualResult.meta.model).toBe('deepseek-chat');
      expect(actualResult.meta.providerRequestId).toBe('req-1');
    });

    it('persists the assistant turn with disclaimerShown and the provider audit trail', async () => {
      stubExchange();

      await buildService().sendMessage('session-1', { content: 'Halo' }, inputActor);

      const actualAssistantAppend = chatRepositoryMock.appendMessage.mock.calls[1][0] as Record<
        string,
        unknown
      >;
      expect(actualAssistantAppend.disclaimerShown).toBe(true);
      expect(actualAssistantAppend.actor).toBe('ASSISTANT');
      expect(actualAssistantAppend.authorUserId).toBeUndefined();
      expect(actualAssistantAppend.providerRequestId).toBe('req-1');
      expect(actualAssistantAppend.providerLatencyMs).toBe(820);
    });

    it('stamps the assistant turn after the user turn so the transcript cannot flip', async () => {
      stubExchange();

      await buildService().sendMessage('session-1', { content: 'Halo' }, inputActor);

      const userAppend = chatRepositoryMock.appendMessage.mock.calls[0][0] as { createdAt: Date };
      const assistantAppend = chatRepositoryMock.appendMessage.mock.calls[1][0] as {
        createdAt: Date;
      };
      expect(assistantAppend.createdAt.getTime()).toBeGreaterThan(userAppend.createdAt.getTime());
    });

    it('leads the completion request with the channel system prompt', async () => {
      stubExchange();

      await buildService().sendMessage('session-1', { content: 'Halo' }, inputActor);

      const actualMessages = (
        sendChatCompletionMock.mock.calls[0][1] as { messages: ChatCompletionMessage[] }
      ).messages;
      expect(actualMessages[0]?.role).toBe('system');
      expect(actualMessages[0]?.content).toContain('never state or imply a diagnosis');
      expect(actualMessages[1]).toEqual({ role: 'user', content: 'Kapan jam buka klinik?' });
    });

    it('persists the user turn before calling the provider', async () => {
      stubActiveProvider();
      chatRepositoryMock.findSessionForOwner.mockResolvedValue(buildSession());
      chatRepositoryMock.appendMessage.mockResolvedValue(buildMessage());
      chatRepositoryMock.listMessagesForSession.mockResolvedValue({
        items: [buildMessage()],
        nextCursor: null,
      });
      sendChatCompletionMock.mockRejectedValue(
        new AiChatbotError('AI_PROVIDER_TIMEOUT', 'AI provider request timed out'),
      );

      await buildService()
        .sendMessage('session-1', { content: 'Halo' }, inputActor)
        .catch(() => undefined);

      // The transcript records what was asked even when the answer never came.
      expect(chatRepositoryMock.appendMessage).toHaveBeenCalledTimes(1);
      expect(chatRepositoryMock.appendMessage.mock.calls[0][0].actor).toBe('USER');
    });

    it('reports another owner’s session as not found', async () => {
      chatRepositoryMock.findSessionForOwner.mockResolvedValue(null);
      stubActiveProvider();

      const actualError = await buildService()
        .sendMessage('session-1', { content: 'Halo' }, inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(NotFoundException);
      expect(sendChatCompletionMock).not.toHaveBeenCalled();
    });
  });

  describe('reads and deletes', () => {
    it('lists the owner’s sessions without needing the feature flag', async () => {
      chatRepositoryMock.listSessionsForOwner.mockResolvedValue({
        items: [buildSession()],
        nextCursor: 'session-1',
      });

      const actualList = await buildService({}).listOwnSessions({ limit: 20 }, inputActor);

      expect(actualList.items).toHaveLength(1);
      expect(actualList.nextCursor).toBe('session-1');
      expect(chatRepositoryMock.listSessionsForOwner).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: 'user-patient' }),
      );
    });

    it('checks ownership before returning a transcript', async () => {
      chatRepositoryMock.findSessionForOwner.mockResolvedValue(null);

      const actualError = await buildService()
        .listOwnSessionMessages('session-1', { limit: 20 }, inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(NotFoundException);
      expect(chatRepositoryMock.listMessagesForSession).not.toHaveBeenCalled();
    });

    it('reports a failed ownership-scoped delete as not found', async () => {
      chatRepositoryMock.softDeleteSessionForOwner.mockResolvedValue(false);

      const actualError = await buildService()
        .deleteOwnSession('session-1', inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(NotFoundException);
    });
  });
});
