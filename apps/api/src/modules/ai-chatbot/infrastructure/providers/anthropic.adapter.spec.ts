import { AiChatbotError } from '../../ai-chatbot.error';
import { AiProviderHttpClient } from '../ai-provider-http.client';
import { AiProviderHttpRequest, ResolvedAiProviderConfig, SendChatCompletionInput } from '../ai-provider.types';
import { AnthropicAdapter } from './anthropic.adapter';

describe('AnthropicAdapter', () => {
  const sendJsonRequestMock = jest.fn();
  const httpClientMock = { sendJsonRequest: sendJsonRequestMock } as unknown as AiProviderHttpClient;
  const adapter = new AnthropicAdapter(httpClientMock);

  const inputConfig: ResolvedAiProviderConfig = {
    configId: 'config-1',
    providerKind: 'ANTHROPIC',
    apiKey: 'sk-ant-test',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1_024,
    timeoutMs: 30_000,
  };

  const inputMessages: SendChatCompletionInput = {
    sessionExternalId: null,
    channel: 'DOCTOR',
    messages: [
      { role: 'system', content: 'You are a clinical reference assistant.' },
      { role: 'user', content: 'Ringkas pedoman hipertensi.' },
      { role: 'assistant', content: 'Baik, berikut ringkasannya.' },
      { role: 'user', content: 'Lanjutkan.' },
    ],
    contextPayload: {},
  };

  function respondWith(body: unknown, init: ResponseInit = {}): void {
    sendJsonRequestMock.mockResolvedValue({
      response: new Response(JSON.stringify(body), { status: 200, ...init }),
      latencyMs: 77,
    });
  }

  beforeEach(() => {
    sendJsonRequestMock.mockReset();
  });

  it('supports only ANTHROPIC', () => {
    expect(adapter.supports('ANTHROPIC')).toBe(true);
    expect(adapter.supports('OPENAI')).toBe(false);
    expect(adapter.supports('OLLAMA')).toBe(false);
  });

  it('lifts system messages into the top-level system field', async () => {
    respondWith({ id: 'msg_1', content: [{ type: 'text', text: 'ok' }] });

    await adapter.sendChatCompletion(inputConfig, inputMessages);

    const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
    expect(actualRequest.url).toBe('https://api.anthropic.com/v1/messages');
    expect(actualRequest.headers['x-api-key']).toBe('sk-ant-test');
    expect(actualRequest.headers['anthropic-version']).toBe('2023-06-01');
    expect(actualRequest.body).toEqual({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1_024,
      system: 'You are a clinical reference assistant.',
      messages: [
        { role: 'user', content: 'Ringkas pedoman hipertensi.' },
        { role: 'assistant', content: 'Baik, berikut ringkasannya.' },
        { role: 'user', content: 'Lanjutkan.' },
      ],
    });
  });

  it('normalizes a successful message with concatenated text blocks', async () => {
    respondWith(
      {
        id: 'msg_abc',
        model: 'claude-sonnet-4-20250514',
        content: [
          { type: 'text', text: 'Bagian satu. ' },
          { type: 'tool_use', text: 'ignored' },
          { type: 'text', text: 'Bagian dua.' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 30, output_tokens: 12 },
      },
      { headers: { 'request-id': 'req_ant_1' } },
    );

    const actualResult = await adapter.sendChatCompletion(inputConfig, inputMessages);

    expect(actualResult.content).toBe('Bagian satu. Bagian dua.');
    expect(actualResult.providerRequestId).toBe('req_ant_1');
    expect(actualResult.providerMessageId).toBe('msg_abc');
    expect(actualResult.latencyMs).toBe(77);
    expect(actualResult.rawMetadata).toEqual({
      usage: { input_tokens: 30, output_tokens: 12 },
      stopReason: 'end_turn',
    });
  });

  it.each([
    [401, { error: { message: 'invalid x-api-key' } }, 'AI_PROVIDER_UNAUTHORIZED'],
    [404, { error: { message: 'model: claude-nope' } }, 'AI_PROVIDER_MODEL_NOT_FOUND'],
    [429, { error: { message: 'rate_limit_error' } }, 'AI_PROVIDER_UNAVAILABLE'],
    [529, { error: { message: 'overloaded_error' } }, 'AI_PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %s to %s', async (status, body, expectedCode) => {
    sendJsonRequestMock.mockResolvedValue({
      response: new Response(JSON.stringify(body), { status: status as number }),
      latencyMs: 5,
    });

    const actualError = await adapter
      .sendChatCompletion(inputConfig, inputMessages)
      .catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(AiChatbotError);
    expect((actualError as AiChatbotError).code).toBe(expectedCode);
  });

  it('rejects a success response without any text block', async () => {
    // A tool_use block without a name is malformed, so it does not rescue an
    // otherwise-empty reply the way a well-formed tool call does.
    respondWith({ id: 'msg_x', content: [{ type: 'tool_use' }] });

    const actualError = await adapter
      .sendChatCompletion(inputConfig, inputMessages)
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect((actualError as AiChatbotError).message).toContain('unexpected completion shape');
  });

  describe('tool support', () => {
    const inputWithTools: SendChatCompletionInput = {
      ...inputMessages,
      tools: [
        {
          name: 'list_my_appointments',
          description: 'List your appointments for a date',
          parameters: {
            type: 'object',
            properties: { date: { type: 'string' } },
          },
        },
      ],
    };

    it('serializes the tool catalogue with input_schema', async () => {
      respondWith({ id: 'msg_1', content: [{ type: 'text', text: 'ok' }] });

      await adapter.sendChatCompletion(inputConfig, inputWithTools);

      const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
      expect(actualRequest.body.tools).toEqual([
        {
          name: 'list_my_appointments',
          description: 'List your appointments for a date',
          input_schema: {
            type: 'object',
            properties: { date: { type: 'string' } },
          },
        },
      ]);
    });

    it('omits the tools field entirely for an empty catalogue', async () => {
      respondWith({ id: 'msg_1', content: [{ type: 'text', text: 'ok' }] });

      await adapter.sendChatCompletion(inputConfig, { ...inputMessages, tools: [] });

      const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
      expect(actualRequest.body).not.toHaveProperty('tools');
    });

    it('normalizes tool_use blocks alongside the text blocks', async () => {
      respondWith({
        id: 'msg_tool',
        content: [
          { type: 'text', text: 'Saya cek jadwal Anda.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'list_my_appointments',
            input: { date: '2026-08-02' },
          },
        ],
        stop_reason: 'tool_use',
      });

      const actualResult = await adapter.sendChatCompletion(inputConfig, inputWithTools);

      expect(actualResult.content).toBe('Saya cek jadwal Anda.');
      expect(actualResult.toolCalls).toEqual([
        { id: 'toolu_1', name: 'list_my_appointments', arguments: { date: '2026-08-02' } },
      ]);
    });

    it('accepts a tool_use-only reply with empty content', async () => {
      respondWith({
        id: 'msg_tool',
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'list_my_appointments', input: {} },
        ],
        stop_reason: 'tool_use',
      });

      const actualResult = await adapter.sendChatCompletion(inputConfig, inputWithTools);

      expect(actualResult.content).toBe('');
      expect(actualResult.toolCalls).toHaveLength(1);
    });

    it('serializes Mode B replay turns into the block dialect', async () => {
      respondWith({ id: 'msg_2', content: [{ type: 'text', text: 'Jadwal Anda kosong.' }] });

      await adapter.sendChatCompletion(inputConfig, {
        ...inputWithTools,
        messages: [
          { role: 'user', content: 'Cek jadwal saya besok.' },
          {
            role: 'assistant',
            content: 'Saya cek jadwal Anda.',
            toolCalls: [
              { id: 'toolu_1', name: 'list_my_appointments', arguments: { date: '2026-08-03' } },
            ],
          },
          {
            role: 'tool',
            content: '{"appointments":[]}',
            toolCallId: 'toolu_1',
            toolName: 'list_my_appointments',
          },
        ],
      });

      const actualRequest = sendJsonRequestMock.mock.calls[0][0] as AiProviderHttpRequest;
      expect(actualRequest.body.messages).toEqual([
        { role: 'user', content: 'Cek jadwal saya besok.' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Saya cek jadwal Anda.' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'list_my_appointments',
              input: { date: '2026-08-03' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"appointments":[]}' },
          ],
        },
      ]);
    });
  });
});
