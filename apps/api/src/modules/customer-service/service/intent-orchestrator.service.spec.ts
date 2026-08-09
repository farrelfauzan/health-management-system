import { ConfigService } from '@nestjs/config';

import { searchFaqArgumentsSchema, searchFaqResultSchema } from '@hms/shared-types';

import { SendChatCompletionResult } from '../../ai-chatbot/infrastructure/ai-provider.types';
import { AiProviderResolverService } from '../../ai-chatbot/service/ai-provider-resolver.service';
import { CsTool } from '../tools/cs-tool.interface';
import { CsToolRegistry } from '../tools/cs-tool.registry';
import { CsToolContext } from '../tools/cs-tool.types';
import { IntentOrchestratorService } from './intent-orchestrator.service';

describe('IntentOrchestratorService', () => {
  const inputContext: CsToolContext = {
    conversationId: 'conversation-1',
    channel: 'TELEGRAM',
    externalChatId: '12345',
  };

  let mockSendChatCompletion: jest.Mock<Promise<SendChatCompletionResult>, [unknown, unknown]>;
  let registry: CsToolRegistry;
  let orchestrator: IntentOrchestratorService;

  function buildCompletion(
    overrides: Partial<SendChatCompletionResult> = {},
  ): SendChatCompletionResult {
    return {
      content: 'Klinik buka pukul 08.00.',
      toolCalls: [],
      providerKind: 'OPENAI',
      providerRequestId: 'req-1',
      providerMessageId: null,
      model: 'gpt-test',
      latencyMs: 12,
      rawMetadata: {},
      ...overrides,
    } as SendChatCompletionResult;
  }

  function buildFaqTool(execute: jest.Mock): CsTool {
    return {
      name: 'search_faq',
      description: 'cari FAQ',
      argumentSchema: searchFaqArgumentsSchema,
      resultSchema: searchFaqResultSchema,
      execute,
    } as CsTool;
  }

  function buildOrchestrator(): IntentOrchestratorService {
    const mockResolver = {
      resolveActiveProvider: jest.fn().mockResolvedValue({
        adapter: { sendChatCompletion: mockSendChatCompletion },
        config: { configId: 'config-1' },
      }),
    };
    return new IntentOrchestratorService(
      new ConfigService({}),
      mockResolver as unknown as AiProviderResolverService,
      registry,
    );
  }

  beforeEach(() => {
    mockSendChatCompletion = jest.fn().mockResolvedValue(buildCompletion());
    registry = new CsToolRegistry();
    orchestrator = buildOrchestrator();
  });

  it('offers the registered tools on the wire, derived from their own schemas', async () => {
    registry.registerTool(buildFaqTool(jest.fn()));
    orchestrator = buildOrchestrator();

    await orchestrator.composeReply(inputContext, [{ role: 'CUSTOMER', content: 'halo' }]);

    const [, input] = mockSendChatCompletion.mock.calls[0] ?? [];
    const tools = (input as { tools?: Array<{ name: string; parameters: unknown }> }).tools ?? [];
    expect(tools.map((tool) => tool.name)).toEqual(['search_faq']);
    // What the model is told and what dispatch validates are one definition.
    expect(tools[0]?.parameters).toMatchObject({
      type: 'object',
      properties: { query: expect.anything() },
    });
  });

  it('carries no tools field at all when nothing is registered', async () => {
    await orchestrator.composeReply(inputContext, [{ role: 'CUSTOMER', content: 'halo' }]);

    const [, input] = mockSendChatCompletion.mock.calls[0] ?? [];
    expect(input).not.toHaveProperty('tools');
  });

  it('feeds a tool result back to the model and answers from the second round', async () => {
    registry.registerTool(
      buildFaqTool(
        jest.fn().mockResolvedValue({
          result: { passages: [{ documentTitle: 'Jam Buka', content: '08.00-16.00' }] },
        }),
      ),
    );
    orchestrator = buildOrchestrator();
    mockSendChatCompletion
      .mockResolvedValueOnce(
        buildCompletion({
          content: '',
          toolCalls: [{ id: 'call-1', name: 'search_faq', arguments: { query: 'jam buka' } }],
        }),
      )
      .mockResolvedValueOnce(buildCompletion({ content: 'Klinik buka 08.00-16.00.' }));

    const actual = await orchestrator.composeReply(inputContext, [
      { role: 'CUSTOMER', content: 'jam buka?' },
    ]);

    // D-CS-02: results DO return to the model here, because the payload class
    // is non-sensitive by construction and reply quality depends on it.
    expect(mockSendChatCompletion).toHaveBeenCalledTimes(2);
    const [, secondInput] = mockSendChatCompletion.mock.calls[1] ?? [];
    const messages = (secondInput as { messages: Array<{ role: string }> }).messages;
    expect(messages.some((message) => message.role === 'tool')).toBe(true);
    expect(actual.replyContent).toBe('Klinik buka 08.00-16.00.');
    expect(actual.toolInvocations).toEqual([
      expect.objectContaining({ toolName: 'search_faq', outcome: 'SUCCESS' }),
    ]);
  });

  it('stops the loop the moment a tool hands back a deterministic reply', async () => {
    registry.registerTool(
      buildFaqTool(
        jest.fn().mockResolvedValue({
          result: { passages: [] },
          deterministicReply: 'Mohon konfirmasi nomor Anda.',
          pausesConversation: true,
          requestContact: true,
        }),
      ),
    );
    orchestrator = buildOrchestrator();
    mockSendChatCompletion.mockResolvedValueOnce(
      buildCompletion({
        content: '',
        toolCalls: [{ id: 'call-1', name: 'search_faq', arguments: { query: 'daftar' } }],
      }),
    );

    const actual = await orchestrator.composeReply(inputContext, [
      { role: 'CUSTOMER', content: 'saya mau daftar' },
    ]);

    // §5.1.1 puts the verification exchange outside the LLM entirely: the
    // provider is never asked to phrase this, or even told it happened.
    expect(mockSendChatCompletion).toHaveBeenCalledTimes(1);
    expect(actual).toMatchObject({
      replyContent: 'Mohon konfirmasi nomor Anda.',
      isDeterministic: true,
      requestContact: true,
      pausesConversation: true,
    });
  });

  it('executes at most three tool calls per inbound message', async () => {
    const mockExecute = jest.fn().mockResolvedValue({ result: { passages: [] } });
    registry.registerTool(buildFaqTool(mockExecute));
    orchestrator = buildOrchestrator();
    mockSendChatCompletion.mockResolvedValue(
      buildCompletion({
        content: 'masih mencari',
        toolCalls: [
          { id: 'call-1', name: 'search_faq', arguments: { query: 'satu' } },
          { id: 'call-2', name: 'search_faq', arguments: { query: 'dua' } },
        ],
      }),
    );

    const actual = await orchestrator.composeReply(inputContext, [
      { role: 'CUSTOMER', content: 'halo' },
    ]);

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(actual.toolInvocations).toHaveLength(3);
  });

  it('records a refused tool call and still answers the customer', async () => {
    registry.registerTool(buildFaqTool(jest.fn()));
    orchestrator = buildOrchestrator();
    mockSendChatCompletion
      .mockResolvedValueOnce(
        buildCompletion({
          content: '',
          toolCalls: [{ id: 'call-1', name: 'get_patient_summary', arguments: {} }],
        }),
      )
      .mockResolvedValueOnce(buildCompletion({ content: 'Maaf, saya tidak punya informasi itu.' }));

    const actual = await orchestrator.composeReply(inputContext, [
      { role: 'CUSTOMER', content: 'siapa pasien nomor 3?' },
    ]);

    expect(actual.toolInvocations).toEqual([
      expect.objectContaining({ toolName: 'get_patient_summary', outcome: 'FAILED' }),
    ]);
    expect(actual.replyContent).toBe('Maaf, saya tidak punya informasi itu.');
  });

  it('returns a null reply rather than throwing when the provider is unreachable', async () => {
    mockSendChatCompletion.mockRejectedValue(new Error('upstream down'));

    const actual = await orchestrator.composeReply(inputContext, [
      { role: 'CUSTOMER', content: 'halo' },
    ]);

    // The caller is answering someone on WhatsApp, where an exception has no
    // representation.
    expect(actual.replyContent).toBeNull();
  });
});
