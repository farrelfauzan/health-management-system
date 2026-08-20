import { ConfigService } from '@nestjs/config';

import { ChatMessageRecord, ChatSessionRecord, checkMedicationStockToolArgsSchema } from '@hms/shared-types';

import { AuditService } from '../../common/audit/audit.service';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { CurrentUser } from '../../common/auth/current-user.type';
import { TogetherEmbeddingService } from '../../common/embedding/together-embedding.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { AiChatbotError } from './ai-chatbot.error';
import { AiProviderHttpClient } from './infrastructure/ai-provider-http.client';
import {
  ResolvedAiProviderConfig,
  SendChatCompletionInput,
} from './infrastructure/ai-provider.types';
import { AnthropicAdapter } from './infrastructure/providers/anthropic.adapter';
import { OpenAiCompatibleAdapter } from './infrastructure/providers/openai-compatible.adapter';
import { ChatRepository } from './repository/chat.repository';
import { AiChatbotService } from './service/ai-chatbot.service';
import { AiProviderResolverService } from './service/ai-provider-resolver.service';
import { ChatContextEnrichmentService } from './service/chat-context-enrichment.service';
import { ChatRetrievalService } from './service/chat-retrieval.service';
import { ChatSessionTitleService } from './service/chat-session-title.service';
import { SafetyPolicyService } from './service/safety-policy.service';
import { ChatTool } from './tools/chat-tool.interface';
import { ChatToolRegistry } from './tools/chat-tool.registry';

/**
 * The SJ-17 inventory, enforced.
 *
 * `docs/security/ai-vendor-dpa.md` claims a specific, finite set of payloads
 * crosses to each external processor. That claim was produced by reading the
 * code, and a document produced by reading is true only on the day it was
 * written — the next field somebody folds into a completion request is exactly
 * the field the DPA does not cover, and nothing would have failed.
 *
 * So these tests are deliberately *exhaustive rather than illustrative*. They
 * assert complete key sets and complete message counts, not the presence of
 * particular items, because presence assertions pass unchanged when a payload
 * is added. A failure here is not necessarily a bug: it means the boundary
 * moved and §3, §4 and the gap list in §6 need re-reading before the change
 * ships. The failure messages say so.
 *
 * Scope note: this pins *what leaves the boundary*, not whether leaving is
 * permitted. The flags that decide whether a payload is built at all are the
 * subject of the service's own spec.
 */
describe('external AI processor egress contract (SJ-17)', () => {
  describe('❶ chat vendor — the adapter wire body', () => {
    const sendJsonRequestMock = jest.fn();
    const httpClientMock = {
      sendJsonRequest: sendJsonRequestMock,
    } as unknown as AiProviderHttpClient;

    function buildConfig(
      overrides: Partial<ResolvedAiProviderConfig> = {},
    ): ResolvedAiProviderConfig {
      return {
        configId: 'config-1',
        providerKind: 'DEEPSEEK',
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        maxTokens: 2_048,
        timeoutMs: 30_000,
        ...overrides,
      };
    }

    /**
     * Deliberately carries values in every field the input type has, including
     * the two the inventory claims are dropped. A body assertion is only
     * meaningful if the fields it must not contain were actually populated.
     */
    const inputWithEveryField: SendChatCompletionInput = {
      sessionExternalId: 'upstream-thread-abc',
      channel: 'PATIENT',
      messages: [
        { role: 'system', content: 'You are a clinic assistant.' },
        { role: 'user', content: 'Kapan jam buka klinik?' },
      ],
      contextPayload: { displayName: 'Siti Rahayu', activeQueueNumber: 12 },
    };

    /** Each vendor only parses its own envelope, so the stub follows the kind. */
    function respondAs(kind: 'OPENAI' | 'ANTHROPIC'): void {
      const payload =
        kind === 'ANTHROPIC'
          ? { id: 'msg-abc', model: 'claude', content: [{ type: 'text', text: 'Klinik buka 08.00.' }] }
          : {
              id: 'chatcmpl-abc',
              model: 'deepseek-chat',
              choices: [{ message: { content: 'Klinik buka 08.00.' }, finish_reason: 'stop' }],
            };
      sendJsonRequestMock.mockResolvedValue({
        response: new Response(JSON.stringify(payload), { status: 200 }),
        latencyMs: 42,
      });
    }

    beforeEach(() => {
      sendJsonRequestMock.mockReset();
    });

    function readRequestBody(): Record<string, unknown> {
      return (sendJsonRequestMock.mock.calls[0][0] as { body: Record<string, unknown> }).body;
    }

    it('OpenAI-shaped: transmits exactly model, messages and max_tokens', async () => {
      respondAs('OPENAI');

      await new OpenAiCompatibleAdapter(httpClientMock).sendChatCompletion(
        buildConfig(),
        inputWithEveryField,
      );

      expect(Object.keys(readRequestBody()).sort()).toEqual(['max_tokens', 'messages', 'model']);
    });

    it('Anthropic: transmits exactly model, max_tokens, messages and system', async () => {
      respondAs('ANTHROPIC');

      await new AnthropicAdapter(httpClientMock).sendChatCompletion(
        buildConfig({ providerKind: 'ANTHROPIC', baseUrl: 'https://api.anthropic.com/v1' }),
        inputWithEveryField,
      );

      expect(Object.keys(readRequestBody()).sort()).toEqual([
        'max_tokens',
        'messages',
        'model',
        'system',
      ]);
    });

    it.each([
      [
        'OpenAI-shaped',
        'OPENAI' as const,
        () => new OpenAiCompatibleAdapter(httpClientMock),
        buildConfig(),
      ],
      [
        'Anthropic',
        'ANTHROPIC' as const,
        () => new AnthropicAdapter(httpClientMock),
        buildConfig({ providerKind: 'ANTHROPIC', baseUrl: 'https://api.anthropic.com/v1' }),
      ],
    ])(
      '%s: drops sessionExternalId, channel and contextPayload rather than transmitting them',
      async (_label, kind, buildAdapter, config) => {
        respondAs(kind);

        await buildAdapter().sendChatCompletion(config, inputWithEveryField);

        // The orchestration service folds context into `messages` before the
        // call; the struct field rides along for a future adapter with native
        // structured-context support. If one gains it, the inventory's §3.1
        // row 2 stops describing how the data crosses.
        const serializedBody = JSON.stringify(readRequestBody());
        expect(serializedBody).not.toContain('upstream-thread-abc');
        expect(serializedBody).not.toContain('Siti Rahayu');
        expect(serializedBody).not.toContain('activeQueueNumber');
      },
    );
  });

  describe('❶ chat vendor — what the orchestration service assembles', () => {
    const chatRepositoryMock = {
      findSessionForOwner: jest.fn(),
      appendUserMessageWithinQuota: jest.fn(),
      appendMessage: jest.fn(),
      listMessagesForSession: jest.fn(),
      setSessionTitleIfUnset: jest.fn(),
    };
    const sendChatCompletionMock = jest.fn();
    const resolveActiveProviderMock = jest.fn();
    const buildContextMock = jest.fn();
    const retrieveMock = jest.fn();
    const generateTitleMock = jest.fn();
    const findUserByIdMock = jest.fn();

    const inputActor: CurrentUser = { sub: 'user-doctor', email: 'doctor@hms.local' };

    function buildSession(overrides: Partial<ChatSessionRecord> = {}): ChatSessionRecord {
      return {
        id: 'session-1',
        ownerUserId: 'user-doctor',
        channel: 'DOCTOR',
        providerKey: 'config-1',
        providerKind: 'DEEPSEEK',
        providerSessionId: null,
        title: 'Stok obat',
        createdAt: new Date('2026-08-12T04:00:00.000Z'),
        updatedAt: new Date('2026-08-12T04:00:00.000Z'),
        ...overrides,
      };
    }

    function buildMessage(overrides: Partial<ChatMessageRecord> = {}): ChatMessageRecord {
      return {
        id: 'message-1',
        sessionId: 'session-1',
        authorUserId: 'user-doctor',
        actor: 'USER',
        content: 'Cek stok amoxicillin',
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

    function buildStockTool(): ChatTool {
      return {
        name: 'check_medication_stock',
        description: 'Check current medication stock levels',
        channels: ['DOCTOR'],
        allowedRoleCodes: ['DOCTOR'],
        requiredPermission: { resource: 'medication', action: 'read', scope: 'ANY' },
        argumentSchema: checkMedicationStockToolArgsSchema,
        execute: jest.fn().mockResolvedValue({ medicationCount: 3, patientNote: 'PHI-CANARY' }),
      };
    }

    function buildService(registry: ChatToolRegistry = new ChatToolRegistry()): AiChatbotService {
      return new AiChatbotService(
        chatRepositoryMock as unknown as ChatRepository,
        { findUserById: findUserByIdMock } as unknown as AuthRepository,
        { resolveActiveProvider: resolveActiveProviderMock } as unknown as AiProviderResolverService,
        { buildContext: buildContextMock } as unknown as ChatContextEnrichmentService,
        { retrieve: retrieveMock } as unknown as ChatRetrievalService,
        {
          evaluateInput: () => ({ outcome: 'ALLOW', safetyTags: [] }),
          evaluateOutput: (content: string) => ({ content, safetyTags: [] }),
          messageQuota: { since: new Date('2026-08-14T00:00:00.000Z'), limit: 60 },
          sessionQuota: { since: new Date('2026-08-13T00:00:00.000Z'), limit: 20 },
          buildMessageQuotaError: () => new AiChatbotError('AI_RATE_LIMITED', 'limit'),
          buildSessionQuotaError: () => new AiChatbotError('AI_RATE_LIMITED', 'limit'),
        } as unknown as SafetyPolicyService,
        registry,
        { generateTitle: generateTitleMock } as unknown as ChatSessionTitleService,
        { record: jest.fn() } as unknown as AuditService,
        new ConfigService({ AI_CHAT_ENABLED: 'true' }),
        {
          isEnabled: jest.fn().mockResolvedValue(true),
          invalidate: jest.fn(),
        } as unknown as FeatureAvailabilityCacheService,
      );
    }

    beforeEach(() => {
      jest.clearAllMocks();
      resolveActiveProviderMock.mockResolvedValue({
        adapter: { supports: () => true, sendChatCompletion: sendChatCompletionMock },
        config: { configId: 'config-1', providerKind: 'DEEPSEEK' },
      });
      chatRepositoryMock.findSessionForOwner.mockResolvedValue(buildSession());
      chatRepositoryMock.appendUserMessageWithinQuota.mockResolvedValue(buildMessage());
      chatRepositoryMock.appendMessage.mockImplementation((data: { actor: string }) =>
        Promise.resolve(buildMessage({ actor: data.actor as ChatMessageRecord['actor'] })),
      );
      chatRepositoryMock.listMessagesForSession.mockResolvedValue({
        items: [buildMessage()],
        nextCursor: null,
      });
      chatRepositoryMock.setSessionTitleIfUnset.mockResolvedValue(true);
      buildContextMock.mockResolvedValue({});
      retrieveMock.mockResolvedValue({ promptBlock: '', citations: [] });
      generateTitleMock.mockResolvedValue('Stok obat');
      findUserByIdMock.mockResolvedValue({
        roles: [
          {
            role: {
              code: 'DOCTOR',
              permissions: [
                { permission: { resource: 'medication', action: 'read', scope: 'ANY' } },
              ],
            },
          },
        ],
      });
      sendChatCompletionMock.mockResolvedValue({
        content: 'Stok amoxicillin 3 box.',
        toolCalls: [],
        providerKind: 'DEEPSEEK',
        providerRequestId: 'req-1',
        providerMessageId: 'msg-1',
        model: 'deepseek-chat',
        latencyMs: 820,
        rawMetadata: {},
      });
    });

    function readSentInput(callIndex = 0): SendChatCompletionInput {
      return sendChatCompletionMock.mock.calls[callIndex][1] as SendChatCompletionInput;
    }

    /**
     * The maximal exchange: every optional payload the inventory lists is
     * present at once. Counting the result is what makes a fifth source fail
     * here rather than ship silently.
     */
    async function runMaximalExchange(): Promise<void> {
      buildContextMock.mockResolvedValue({ todayAppointmentCount: 7 });
      retrieveMock.mockResolvedValue({
        promptBlock: '[{"reference":1,"title":"SOP","language":"ID","content":"Pendaftaran 07.00"}]',
        citations: [
          {
            reference: 1,
            documentId: 'document-1',
            title: 'SOP',
            language: 'ID',
            sourceTier: 'CLINIC',
          },
        ],
      });
      chatRepositoryMock.listMessagesForSession.mockResolvedValue({
        items: [
          buildMessage({ id: 'turn-1', actor: 'USER', content: 'Pertanyaan lama' }),
          buildMessage({ id: 'turn-2', actor: 'ASSISTANT', content: 'Jawaban lama' }),
        ],
        nextCursor: null,
      });
      const registry = new ChatToolRegistry();
      registry.registerTool(buildStockTool());
      await buildService(registry).sendMessage(
        'session-1',
        { content: 'Cek stok amoxicillin' },
        inputActor,
      );
    }

    it('sends exactly the five input fields the inventory names', async () => {
      await runMaximalExchange();

      expect(Object.keys(readSentInput()).sort()).toEqual([
        'channel',
        'contextPayload',
        'messages',
        'sessionExternalId',
        'tools',
      ]);
    });

    it('assembles exactly four message sources, in the documented order', async () => {
      await runMaximalExchange();
      const actualMessages = readSentInput().messages;

      // system prompt, context, retrieval, then the replayed turns.
      expect(actualMessages.map((message) => message.role)).toEqual([
        'system',
        'system',
        'system',
        'user',
        'assistant',
      ]);
      expect(actualMessages[1]?.content).toContain('todayAppointmentCount');
      expect(actualMessages[2]?.content).toContain('Pendaftaran 07.00');
      expect(actualMessages[3]?.content).toBe('Pertanyaan lama');
      expect(actualMessages[4]?.content).toBe('Jawaban lama');
    });

    it('never constructs a tool-role message, even when lookups executed', async () => {
      const registry = new ChatToolRegistry();
      registry.registerTool(buildStockTool());
      sendChatCompletionMock.mockResolvedValue({
        content: 'Saya cek stok obat.',
        toolCalls: [
          {
            id: 'call_1',
            name: 'check_medication_stock',
            arguments: { medicationName: 'amoxicillin' },
          },
        ],
        providerKind: 'DEEPSEEK',
        providerRequestId: 'req-1',
        providerMessageId: 'msg-1',
        model: 'deepseek-chat',
        latencyMs: 820,
        rawMetadata: {},
      });

      const actualResult = await buildService(registry).sendMessage(
        'session-1',
        { content: 'Cek stok amoxicillin' },
        inputActor,
      );

      // The lookup really ran — otherwise this asserts nothing.
      expect(actualResult.meta.toolResults).toHaveLength(1);
      // Mode A: results reached the client and stopped there. The canary is a
      // field only the tool's own output carries, so a Mode B loop that
      // replayed results would put it on a later request.
      const everySentPayload = JSON.stringify(sendChatCompletionMock.mock.calls);
      expect(everySentPayload).not.toContain('PHI-CANARY');
      expect(everySentPayload).not.toContain('"role":"tool"');
    });

    it('replays no SYSTEM turn, so an earlier exchange is never resent', async () => {
      chatRepositoryMock.listMessagesForSession.mockResolvedValue({
        items: [
          buildMessage({ id: 'old', actor: 'SYSTEM', content: '{"staleCanary":true}' }),
          buildMessage(),
        ],
        nextCursor: null,
      });

      await buildService().sendMessage('session-1', { content: 'Halo' }, inputActor);

      expect(JSON.stringify(readSentInput().messages)).not.toContain('staleCanary');
    });

    it('titles a session from the two excerpts and nothing else', async () => {
      chatRepositoryMock.findSessionForOwner.mockResolvedValue(buildSession({ title: null }));
      buildContextMock.mockResolvedValue({ todayAppointmentCount: 7 });

      await buildService().sendMessage('session-1', { content: 'Cek stok' }, inputActor);

      // §3.1 row 7: a second call per named session, carrying no *new* data.
      // It must not inherit the exchange's context or passages.
      expect(generateTitleMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { channel: 'DOCTOR', question: 'Cek stok', answer: 'Stok amoxicillin 3 box.' },
      );
    });
  });

  describe('❷ embedding vendor — the wire body', () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn();

    beforeEach(() => {
      fetchMock.mockReset();
      global.fetch = fetchMock as unknown as typeof fetch;
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] }),
      });
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    function buildEmbeddingService(): TogetherEmbeddingService {
      const values: Record<string, string> = {
        EMBEDDING_PROVIDER: 'TOGETHER',
        TOGETHER_API_KEY: 'test-key',
        TOGETHER_EMBEDDING_BASE_URL: 'https://together.test',
        TOGETHER_EMBEDDING_DIMENSION: '3',
        TOGETHER_EMBEDDING_MAX_RETRIES: '0',
      };
      return new TogetherEmbeddingService({
        get: (key: string) => values[key],
      } as unknown as ConfigService);
    }

    it('transmits exactly model and input — the text itself, verbatim', async () => {
      await buildEmbeddingService().embedTexts({ texts: ['Apakah saya alergi penisilin?'] });

      const actualBody = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      ) as Record<string, unknown>;

      // No redaction is applied on this path and none can be — a redacted
      // question retrieves the wrong passages (§4). The inventory records the
      // question as crossing verbatim; this is what makes that checkable.
      expect(Object.keys(actualBody).sort()).toEqual(['input', 'model']);
      expect(actualBody.input).toEqual(['Apakah saya alergi penisilin?']);
    });
  });

  /**
   * Not an egress assertion but the reason one row of §3.2 is narrow: the
   * redaction list is what keeps identifiers out of the context payload, and
   * shrinking it silently widens what §3.2 says crosses.
   */
  it('keeps the redaction denylist that §3.2 documents', async () => {
    const { redactChatContext } = await import('./service/redact-chat-context');
    const inputPayload = {
      displayName: 'Siti',
      patientNik: '317',
      bpjsNumber: '000',
      mrn: 'MR-1',
      soapNotes: 'note',
      diagnosis: 'flu',
      allergies: 'penisilin',
      prescriptionId: 'rx-1',
      accessToken: 'tok',
      patientId: 'p-1',
      email: 'a@b.c',
      phone: '08',
      address: 'Jl',
    };

    const actualPayload = redactChatContext(inputPayload);

    expect(Object.keys(actualPayload)).toEqual(['displayName']);
  });
});
