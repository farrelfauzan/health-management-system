import { AiChatbotError } from '../ai-chatbot.error';
import { ResolvedAiProviderConfig } from '../infrastructure/ai-provider.types';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { ChatSessionTitleService } from './chat-session-title.service';

describe('ChatSessionTitleService', () => {
  const sendChatCompletionMock = jest.fn();
  const inputAdapter = {
    supports: () => true,
    sendChatCompletion: sendChatCompletionMock,
  } as unknown as AiChatProvider;
  const inputConfig = { configId: 'config-1', model: 'deepseek-chat' } as ResolvedAiProviderConfig;
  const inputExchange = {
    channel: 'PATIENT' as const,
    question: 'Kapan jam buka klinik kalau hari Sabtu?',
    answer: 'Klinik buka pukul 08.00 sampai 12.00 pada hari Sabtu.',
  };

  function buildResult(content: string): Record<string, unknown> {
    return {
      content,
      toolCalls: [],
      providerKind: 'DEEPSEEK',
      providerRequestId: 'req-1',
      providerMessageId: 'msg-1',
      model: 'deepseek-chat',
      latencyMs: 120,
      rawMetadata: {},
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('titles the session with the model summary of the exchange', async () => {
    sendChatCompletionMock.mockResolvedValue(buildResult('Jam buka klinik hari Sabtu'));

    const actualTitle = await new ChatSessionTitleService().generateTitle(
      inputAdapter,
      inputConfig,
      inputExchange,
    );

    expect(actualTitle).toBe('Jam buka klinik hari Sabtu');
  });

  it('sends both turns of the exchange, and no tools or context with them', async () => {
    sendChatCompletionMock.mockResolvedValue(buildResult('Jam buka klinik'));

    await new ChatSessionTitleService().generateTitle(inputAdapter, inputConfig, inputExchange);

    const actualInput = sendChatCompletionMock.mock.calls[0]?.[1] as {
      messages: Array<{ role: string; content: string }>;
      contextPayload: Record<string, unknown>;
      tools?: unknown;
    };
    expect(actualInput.messages[0]?.role).toBe('system');
    expect(actualInput.messages[1]?.content).toContain(inputExchange.question);
    expect(actualInput.messages[1]?.content).toContain(inputExchange.answer);
    // Naming a conversation is text summarization: it needs no lookups, and
    // it must not widen what personal context reaches the provider.
    expect(actualInput.contextPayload).toEqual({});
    expect(actualInput.tools).toBeUndefined();
  });

  it('falls back to the question when the provider call fails', async () => {
    sendChatCompletionMock.mockRejectedValue(
      new AiChatbotError('AI_PROVIDER_TIMEOUT', 'Provider timed out'),
    );

    const actualTitle = await new ChatSessionTitleService().generateTitle(
      inputAdapter,
      inputConfig,
      inputExchange,
    );

    // A naming call that failed must never leave the conversation nameless.
    expect(actualTitle).toBe('Kapan jam buka klinik kalau hari Sabtu?');
  });

  it('falls back to the question when the model answers with nothing usable', async () => {
    sendChatCompletionMock.mockResolvedValue(buildResult('   '));

    const actualTitle = await new ChatSessionTitleService().generateTitle(
      inputAdapter,
      inputConfig,
      inputExchange,
    );

    expect(actualTitle).toBe('Kapan jam buka klinik kalau hari Sabtu?');
  });

  it('returns null when neither source yields a title', async () => {
    sendChatCompletionMock.mockResolvedValue(buildResult(''));

    const actualTitle = await new ChatSessionTitleService().generateTitle(
      inputAdapter,
      inputConfig,
      { ...inputExchange, question: '...' },
    );

    expect(actualTitle).toBeNull();
  });
});
