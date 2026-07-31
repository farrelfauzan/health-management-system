import { AiChatbotError } from '../../ai-chatbot.error';
import { AiProviderHttpClient } from '../ai-provider-http.client';
import { AiProviderRegistry } from './ai-provider-registry.service';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter';

describe('AiProviderRegistry', () => {
  const httpClientMock = { sendJsonRequest: jest.fn() } as unknown as AiProviderHttpClient;
  const openAiCompatibleAdapter = new OpenAiCompatibleAdapter(httpClientMock);
  const anthropicAdapter = new AnthropicAdapter(httpClientMock);
  const registry = new AiProviderRegistry(openAiCompatibleAdapter, anthropicAdapter);

  it.each([
    ['OPENAI', openAiCompatibleAdapter],
    ['DEEPSEEK', openAiCompatibleAdapter],
    ['GEMINI', openAiCompatibleAdapter],
    ['OLLAMA', openAiCompatibleAdapter],
    ['OPENAI_COMPATIBLE', openAiCompatibleAdapter],
    ['AZURE_OPENAI', openAiCompatibleAdapter],
    ['ANTHROPIC', anthropicAdapter],
  ] as const)('routes %s to the correct adapter', (kind, expectedAdapter) => {
    expect(registry.resolveAdapter(kind)).toBe(expectedAdapter);
  });

  it('reports an unroutable kind as AI_NOT_CONFIGURED', () => {
    const registryWithoutAnthropic = new AiProviderRegistry(
      openAiCompatibleAdapter,
      // An adapter that supports nothing simulates a deployment where a
      // database enum value has no registered implementation.
      { supports: () => false, sendChatCompletion: jest.fn() } as unknown as AnthropicAdapter,
    );

    const actualError = (() => {
      try {
        registryWithoutAnthropic.resolveAdapter('ANTHROPIC');
        return null;
      } catch (err) {
        return err;
      }
    })();

    expect(actualError).toBeInstanceOf(AiChatbotError);
    expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
  });
});
