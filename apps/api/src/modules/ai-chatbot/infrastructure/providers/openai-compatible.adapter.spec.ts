import { AiChatbotError } from '../../ai-chatbot.error';
import { AiProviderHttpClient } from '../ai-provider-http.client';
import { AiProviderHttpRequest, ResolvedAiProviderConfig, SendChatCompletionInput } from '../ai-provider.types';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter';

describe('OpenAiCompatibleAdapter', () => {
  const sendJsonRequestMock = jest.fn();
  const httpClientMock = { sendJsonRequest: sendJsonRequestMock } as unknown as AiProviderHttpClient;
  const adapter = new OpenAiCompatibleAdapter(httpClientMock);

  const inputMessages: SendChatCompletionInput = {
    sessionExternalId: null,
    channel: 'PATIENT',
    messages: [
      { role: 'system', content: 'You are a clinic assistant.' },
      { role: 'user', content: 'Kapan jam buka klinik?' },
    ],
    contextPayload: {},
  };

  function buildConfig(overrides: Partial<ResolvedAiProviderConfig> = {}): ResolvedAiProviderConfig {
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

  function respondWith(body: unknown, init: ResponseInit = {}): void {
    sendJsonRequestMock.mockResolvedValue({
      response: new Response(JSON.stringify(body), { status: 200, ...init }),
      latencyMs: 42,
    });
  }

  beforeEach(() => {
    sendJsonRequestMock.mockReset();
  });

  it('supports every OpenAI-shaped kind and rejects ANTHROPIC', () => {
    expect(adapter.supports('OPENAI')).toBe(true);
    expect(adapter.supports('DEEPSEEK')).toBe(true);
    expect(adapter.supports('GEMINI')).toBe(true);
    expect(adapter.supports('OLLAMA')).toBe(true);
    expect(adapter.supports('OPENAI_COMPATIBLE')).toBe(true);
    expect(adapter.supports('AZURE_OPENAI')).toBe(true);
    expect(adapter.supports('ANTHROPIC')).toBe(false);
  });

  it('normalizes a successful completion', async () => {
    respondWith(
      {
        id: 'chatcmpl-abc',
        model: 'deepseek-chat',
        choices: [{ message: { content: 'Klinik buka 08.00.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      },
      { headers: { 'x-request-id': 'req-123' } },
    );

    const actualResult = await adapter.sendChatCompletion(buildConfig(), inputMessages);

    expect(actualResult.content).toBe('Klinik buka 08.00.');
    expect(actualResult.providerKind).toBe('DEEPSEEK');
    expect(actualResult.providerRequestId).toBe('req-123');
    expect(actualResult.providerMessageId).toBe('chatcmpl-abc');
    expect(actualResult.model).toBe('deepseek-chat');
    expect(actualResult.latencyMs).toBe(42);
    expect(actualResult.rawMetadata).toEqual({
      usage: { prompt_tokens: 20, completion_tokens: 8 },
      finishReason: 'stop',
    });
  });

  it('posts the wire request with a bearer token and the config limits', async () => {
    respondWith({ id: 'x', choices: [{ message: { content: 'ok' } }] });

    await adapter.sendChatCompletion(buildConfig(), inputMessages);

    const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
    expect(actualRequest.url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(actualRequest.headers.Authorization).toBe('Bearer sk-test-key');
    expect(actualRequest.timeoutMs).toBe(30_000);
    expect(actualRequest.body).toEqual({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a clinic assistant.' },
        { role: 'user', content: 'Kapan jam buka klinik?' },
      ],
      max_tokens: 2_048,
    });
  });

  it('omits the Authorization header for a keyless Ollama config', async () => {
    respondWith({ id: 'x', choices: [{ message: { content: 'ok' } }] });

    await adapter.sendChatCompletion(
      buildConfig({ providerKind: 'OLLAMA', apiKey: null, baseUrl: 'http://127.0.0.1:11434/v1' }),
      inputMessages,
    );

    const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
    expect(actualRequest.url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(actualRequest.headers.Authorization).toBeUndefined();
  });

  it('posts a Gemini config to the OpenAI-compatibility path with a bearer token', async () => {
    respondWith({ id: 'x', choices: [{ message: { content: 'ok' } }] });

    await adapter.sendChatCompletion(
      buildConfig({
        providerKind: 'GEMINI',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.6-flash',
      }),
      inputMessages,
    );

    const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
    expect(actualRequest.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(actualRequest.headers.Authorization).toBe('Bearer sk-test-key');
  });

  it('builds the Azure deployment URL and api-key header', async () => {
    respondWith({ id: 'x', choices: [{ message: { content: 'ok' } }] });

    await adapter.sendChatCompletion(
      buildConfig({
        providerKind: 'AZURE_OPENAI',
        baseUrl: 'https://clinic.openai.azure.com',
        model: 'gpt-4o-mini',
      }),
      inputMessages,
    );

    const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
    expect(actualRequest.url).toBe(
      'https://clinic.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-06-01',
    );
    expect(actualRequest.headers['api-key']).toBe('sk-test-key');
    expect(actualRequest.headers.Authorization).toBeUndefined();
  });

  it.each([
    [401, { error: { message: 'invalid api key' } }, 'AI_PROVIDER_UNAUTHORIZED'],
    [404, { error: { message: 'The model `nope` does not exist' } }, 'AI_PROVIDER_MODEL_NOT_FOUND'],
    [400, { error: 'Model Not Exist' }, 'AI_PROVIDER_MODEL_NOT_FOUND'],
    [404, { error: { message: 'not found' } }, 'AI_PROVIDER_UNAVAILABLE'],
    [429, { error: { message: 'rate limited' } }, 'AI_PROVIDER_UNAVAILABLE'],
    [500, {}, 'AI_PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %s to %s', async (status, body, expectedCode) => {
    sendJsonRequestMock.mockResolvedValue({
      response: new Response(JSON.stringify(body), { status: status as number }),
      latencyMs: 5,
    });

    const actualError = await adapter
      .sendChatCompletion(buildConfig(), inputMessages)
      .catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(AiChatbotError);
    expect((actualError as AiChatbotError).code).toBe(expectedCode);
    expect((actualError as AiChatbotError).upstreamStatusCode).toBe(status);
  });

  it('rejects a success response without completion content', async () => {
    respondWith({ id: 'x', choices: [] });

    const actualError = await adapter
      .sendChatCompletion(buildConfig(), inputMessages)
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect((actualError as AiChatbotError).message).toContain('unexpected completion shape');
  });

  // A reasoning model bills hidden thinking against max_tokens, so a budget
  // too small for it answers 200 with finish_reason "length" and no content
  // at all. That reads as a broken provider unless the message says budget.
  it('names the token budget when a completion is truncated to nothing', async () => {
    respondWith({ id: 'x', choices: [{ message: {}, finish_reason: 'length' }] });

    const actualError = await adapter
      .sendChatCompletion(buildConfig(), inputMessages)
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect((actualError as AiChatbotError).message).toContain('token budget was exhausted');
  });
});
