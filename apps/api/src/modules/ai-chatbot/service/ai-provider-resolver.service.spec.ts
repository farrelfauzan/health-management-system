import { ConfigService } from '@nestjs/config';

import { AiChatbotError } from '../ai-chatbot.error';
import { AiProviderConnection } from '../infrastructure/ai-provider.types';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { AiProviderRegistry } from '../infrastructure/providers/ai-provider-registry.service';
import { AiProviderConfigRepository } from '../repository/ai-provider-config.repository';
import { AiProviderResolverService } from './ai-provider-resolver.service';

describe('AiProviderResolverService', () => {
  const getActiveConnectionMock = jest.fn();
  const configRepositoryMock = {
    getActiveConnection: getActiveConnectionMock,
  } as unknown as AiProviderConfigRepository;
  const mockAdapter: AiChatProvider = { supports: () => true, sendChatCompletion: jest.fn() };
  const resolveAdapterMock = jest.fn().mockReturnValue(mockAdapter);
  const registryMock = { resolveAdapter: resolveAdapterMock } as unknown as AiProviderRegistry;

  function buildService(env: Record<string, string> = {}): AiProviderResolverService {
    return new AiProviderResolverService(configRepositoryMock, registryMock, new ConfigService(env));
  }

  function buildConnection(overrides: Partial<AiProviderConnection> = {}): AiProviderConnection {
    return {
      configId: 'config-1',
      providerKind: 'DEEPSEEK',
      apiKey: 'sk-test',
      baseUrl: null,
      model: 'deepseek-chat',
      maxTokens: 2_048,
      timeoutMs: 30_000,
      isEnabled: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    getActiveConnectionMock.mockReset();
    resolveAdapterMock.mockClear();
  });

  it('resolves the active config with the vendor default base URL', async () => {
    getActiveConnectionMock.mockResolvedValue(buildConnection());

    const actualResolved = await buildService().resolveActiveProvider();

    expect(actualResolved.adapter).toBe(mockAdapter);
    expect(actualResolved.config).toEqual({
      configId: 'config-1',
      providerKind: 'DEEPSEEK',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      maxTokens: 2_048,
      timeoutMs: 30_000,
    });
    expect(resolveAdapterMock).toHaveBeenCalledWith('DEEPSEEK');
  });

  it('strips a trailing slash from a stored base URL override', async () => {
    getActiveConnectionMock.mockResolvedValue(
      buildConnection({ baseUrl: 'https://gateway.clinic.internal/v1/' }),
    );

    const actualResolved = await buildService().resolveActiveProvider();

    expect(actualResolved.config.baseUrl).toBe('https://gateway.clinic.internal/v1');
  });

  it('rejects a disabled config as AI_NOT_CONFIGURED', async () => {
    getActiveConnectionMock.mockResolvedValue(buildConnection({ isEnabled: false }));

    const actualError = await buildService()
      .resolveActiveProvider()
      .catch((err: unknown) => err);

    expect(actualError).toBeInstanceOf(AiChatbotError);
    expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
    expect((actualError as AiChatbotError).message).toContain('disabled');
  });

  it('requires an explicit base URL for OPENAI_COMPATIBLE and AZURE_OPENAI', async () => {
    for (const providerKind of ['OPENAI_COMPATIBLE', 'AZURE_OPENAI'] as const) {
      getActiveConnectionMock.mockResolvedValue(buildConnection({ providerKind, baseUrl: null }));

      const actualError = await buildService()
        .resolveActiveProvider()
        .catch((err: unknown) => err);

      expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
      expect((actualError as AiChatbotError).message).toContain('base URL');
    }
  });

  it('requires an API key for every kind except OLLAMA', async () => {
    getActiveConnectionMock.mockResolvedValue(buildConnection({ apiKey: null }));

    const actualError = await buildService()
      .resolveActiveProvider()
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
    expect((actualError as AiChatbotError).message).toContain('API key');
  });

  it('allows a keyless OLLAMA config', async () => {
    getActiveConnectionMock.mockResolvedValue(
      buildConnection({ providerKind: 'OLLAMA', apiKey: null, model: 'llama3.2:latest' }),
    );

    const actualResolved = await buildService().resolveActiveProvider();

    expect(actualResolved.config.apiKey).toBeNull();
    expect(actualResolved.config.baseUrl).toBe('http://127.0.0.1:11434/v1');
  });

  it('rejects a model id with unsupported characters', async () => {
    getActiveConnectionMock.mockResolvedValue(
      buildConnection({ model: 'deepseek-chat?stream=true' }),
    );

    const actualError = await buildService()
      .resolveActiveProvider()
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
    expect((actualError as AiChatbotError).message).toContain('model id');
  });

  it('falls back to the platform env defaults when no config row exists', async () => {
    getActiveConnectionMock.mockResolvedValue(null);

    const actualResolved = await buildService({
      AI_PLATFORM_PROVIDER_KIND: 'OPENAI',
      AI_PLATFORM_API_KEY: 'sk-platform',
      AI_PLATFORM_MODEL: 'gpt-4o-mini',
      AI_PROVIDER_TIMEOUT_MS: '10000',
    }).resolveActiveProvider();

    expect(actualResolved.config).toEqual({
      configId: 'platform-env',
      providerKind: 'OPENAI',
      apiKey: 'sk-platform',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      maxTokens: 2_048,
      timeoutMs: 10_000,
    });
  });

  it('reports AI_NOT_CONFIGURED when neither a config row nor env fallback exists', async () => {
    getActiveConnectionMock.mockResolvedValue(null);

    const actualError = await buildService()
      .resolveActiveProvider()
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
    expect((actualError as AiChatbotError).message).toContain('No active AI provider');
  });

  it('rejects an unknown platform provider kind', async () => {
    getActiveConnectionMock.mockResolvedValue(null);

    const actualError = await buildService({
      AI_PLATFORM_PROVIDER_KIND: 'GEMINI',
      AI_PLATFORM_MODEL: 'gemini-pro',
    })
      .resolveActiveProvider()
      .catch((err: unknown) => err);

    expect((actualError as AiChatbotError).code).toBe('AI_NOT_CONFIGURED');
    expect((actualError as AiChatbotError).message).toContain('AI_PLATFORM_PROVIDER_KIND');
  });
});
