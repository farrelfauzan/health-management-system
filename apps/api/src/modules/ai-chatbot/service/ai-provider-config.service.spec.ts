import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AiProviderConfigRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AiChatbotError } from '../ai-chatbot.error';
import { AiProviderConfigRepository } from '../repository/ai-provider-config.repository';
import { AiProviderConfigService } from './ai-provider-config.service';
import { AiProviderResolverService } from './ai-provider-resolver.service';

describe('AiProviderConfigService', () => {
  const repositoryMock = {
    listConfigs: jest.fn(),
    findConfigById: jest.fn(),
    createConfig: jest.fn(),
    updateConfig: jest.fn(),
    activateConfig: jest.fn(),
    softDeleteConfig: jest.fn(),
    recordConnectionTest: jest.fn(),
  };
  const sendChatCompletionMock = jest.fn();
  const resolveActiveProviderMock = jest.fn();
  const auditRecordMock = jest.fn();

  const inputActor: CurrentUser = { sub: 'user-admin', email: 'admin@hms.local' };

  function buildService(): AiProviderConfigService {
    return new AiProviderConfigService(
      repositoryMock as unknown as AiProviderConfigRepository,
      { resolveActiveProvider: resolveActiveProviderMock } as unknown as AiProviderResolverService,
      { record: auditRecordMock } as unknown as AuditService,
    );
  }

  function buildRecord(overrides: Partial<AiProviderConfigRecord> = {}): AiProviderConfigRecord {
    return {
      id: 'config-1',
      providerKind: 'DEEPSEEK',
      displayName: 'Clinic DeepSeek',
      hasApiKey: true,
      apiKeyHint: 'x7Kp',
      baseUrl: null,
      defaultModel: 'deepseek-chat',
      isActive: false,
      isEnabled: true,
      maxTokens: 2048,
      timeoutMs: 30000,
      lastTestedAt: null,
      lastTestResult: null,
      createdAt: new Date('2026-08-12T04:00:00.000Z'),
      updatedAt: new Date('2026-08-12T04:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    auditRecordMock.mockResolvedValue(undefined);
  });

  describe('createConfig', () => {
    it('creates a config and never returns key material', async () => {
      repositoryMock.createConfig.mockResolvedValue(buildRecord());

      const actualView = await buildService().createConfig(
        {
          providerKind: 'DEEPSEEK',
          displayName: 'Clinic DeepSeek',
          apiKey: 'sk-secret-value',
          defaultModel: 'deepseek-chat',
          isEnabled: true,
          maxTokens: 2048,
          timeoutMs: 30000,
        },
        inputActor,
      );

      expect(actualView.hasApiKey).toBe(true);
      expect(actualView.apiKeyHint).toBe('x7Kp');
      expect(JSON.stringify(actualView)).not.toContain('sk-secret-value');
      expect(repositoryMock.createConfig).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: 'user-admin' }),
      );
    });

    it('records an audit event without the key', async () => {
      repositoryMock.createConfig.mockResolvedValue(buildRecord());

      await buildService().createConfig(
        {
          providerKind: 'DEEPSEEK',
          displayName: 'Clinic DeepSeek',
          apiKey: 'sk-secret-value',
          defaultModel: 'deepseek-chat',
          isEnabled: true,
          maxTokens: 2048,
          timeoutMs: 30000,
        },
        inputActor,
      );

      const actualAudit = auditRecordMock.mock.calls[0][0] as Record<string, unknown>;
      expect(actualAudit.action).toBe('AI_PROVIDER_CONFIG_CREATED');
      expect(JSON.stringify(actualAudit)).not.toContain('sk-secret-value');
    });

    it('requires an API key for every kind except OLLAMA', async () => {
      const actualError = await buildService()
        .createConfig(
          {
            providerKind: 'OPENAI',
            displayName: 'Clinic OpenAI',
            defaultModel: 'gpt-4o-mini',
            isEnabled: true,
            maxTokens: 2048,
            timeoutMs: 30000,
          },
          inputActor,
        )
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(BadRequestException);
      expect(repositoryMock.createConfig).not.toHaveBeenCalled();
    });

    it('accepts a keyless OLLAMA config', async () => {
      repositoryMock.createConfig.mockResolvedValue(
        buildRecord({ providerKind: 'OLLAMA', hasApiKey: false, apiKeyHint: '' }),
      );

      const actualView = await buildService().createConfig(
        {
          providerKind: 'OLLAMA',
          displayName: 'Clinic Ollama',
          defaultModel: 'llama3.2',
          isEnabled: true,
          maxTokens: 2048,
          timeoutMs: 30000,
        },
        inputActor,
      );

      expect(actualView.hasApiKey).toBe(false);
    });

    it.each(['OPENAI_COMPATIBLE', 'AZURE_OPENAI'] as const)(
      'requires an explicit base URL for %s',
      async (providerKind) => {
        const actualError = await buildService()
          .createConfig(
            {
              providerKind,
              displayName: 'Gateway',
              apiKey: 'sk-key',
              defaultModel: 'gpt-4o-mini',
              isEnabled: true,
              maxTokens: 2048,
              timeoutMs: 30000,
            },
            inputActor,
          )
          .catch((err: unknown) => err);

        expect(actualError).toBeInstanceOf(BadRequestException);
      },
    );

    it('surfaces a missing encryption key as 503 rather than 500', async () => {
      repositoryMock.createConfig.mockRejectedValue(
        new AiChatbotError('AI_NOT_CONFIGURED', 'AI_PROVIDER_ENCRYPTION_KEY is not set'),
      );

      const actualError = await buildService()
        .createConfig(
          {
            providerKind: 'DEEPSEEK',
            displayName: 'Clinic DeepSeek',
            apiKey: 'sk-key',
            defaultModel: 'deepseek-chat',
            isEnabled: true,
            maxTokens: 2048,
            timeoutMs: 30000,
          },
          inputActor,
        )
        .catch((err: unknown) => err);

      expect((actualError as { status?: number }).status).toBe(503);
    });
  });

  describe('updateConfig', () => {
    it('names rotated and changed fields in the audit without values', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord());
      repositoryMock.updateConfig.mockResolvedValue(buildRecord({ displayName: 'Renamed' }));

      await buildService().updateConfig(
        'config-1',
        { displayName: 'Renamed', apiKey: 'sk-rotated-secret' },
        inputActor,
      );

      const actualAudit = auditRecordMock.mock.calls[0][0] as {
        metadata: { changedFields: string[] };
      };
      expect(actualAudit.metadata.changedFields).toEqual(['displayName', 'apiKey']);
      expect(JSON.stringify(actualAudit)).not.toContain('sk-rotated-secret');
    });

    it('refuses to clear the base URL for a kind with no vendor default', async () => {
      repositoryMock.findConfigById.mockResolvedValue(
        buildRecord({ providerKind: 'OPENAI_COMPATIBLE', baseUrl: 'https://gateway.test/v1' }),
      );

      const actualError = await buildService()
        .updateConfig('config-1', { baseUrl: null }, inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(BadRequestException);
      expect(repositoryMock.updateConfig).not.toHaveBeenCalled();
    });

    it('reports an unknown id as not found', async () => {
      repositoryMock.findConfigById.mockResolvedValue(null);

      const actualError = await buildService()
        .updateConfig('missing', { displayName: 'x' }, inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(NotFoundException);
    });
  });

  describe('activateConfig', () => {
    it('activates a valid staged config', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord());
      repositoryMock.activateConfig.mockResolvedValue(buildRecord({ isActive: true }));

      const actualView = await buildService().activateConfig('config-1', inputActor);

      expect(actualView.isActive).toBe(true);
      expect(repositoryMock.activateConfig).toHaveBeenCalledWith('config-1', 'user-admin');
      expect(auditRecordMock.mock.calls[0][0].action).toBe('AI_PROVIDER_CONFIG_ACTIVATED');
    });

    it('refuses to activate a config the resolver would reject', async () => {
      // Keyless OPENAI would resolve to AI_NOT_CONFIGURED on the next patient
      // message; the failure belongs at the admin's click instead.
      repositoryMock.findConfigById.mockResolvedValue(
        buildRecord({ providerKind: 'OPENAI', hasApiKey: false, apiKeyHint: '' }),
      );

      const actualError = await buildService()
        .activateConfig('config-1', inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(BadRequestException);
      expect(repositoryMock.activateConfig).not.toHaveBeenCalled();
    });
  });

  describe('deleteConfig', () => {
    it('soft-deletes an inactive config', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord());

      const actualResult = await buildService().deleteConfig('config-1', inputActor);

      expect(actualResult).toEqual({ id: 'config-1' });
      expect(repositoryMock.softDeleteConfig).toHaveBeenCalledWith('config-1');
    });

    it('refuses to delete the active config', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord({ isActive: true }));

      const actualError = await buildService()
        .deleteConfig('config-1', inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(ConflictException);
      expect(repositoryMock.softDeleteConfig).not.toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('reports a successful round trip and persists the outcome', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord({ isActive: true }));
      resolveActiveProviderMock.mockResolvedValue({
        adapter: { supports: () => true, sendChatCompletion: sendChatCompletionMock },
        config: { configId: 'config-1', maxTokens: 2048 },
      });
      sendChatCompletionMock.mockResolvedValue({ model: 'deepseek-chat' });

      const actualResult = await buildService().testConnection('config-1', inputActor);

      expect(actualResult.isSuccessful).toBe(true);
      expect(actualResult.message).toContain('deepseek-chat');
      expect(repositoryMock.recordConnectionTest).toHaveBeenCalledWith(
        'config-1',
        expect.objectContaining({ isSuccessful: true }),
      );
      // A probe must not spend the clinic's full token budget.
      expect(sendChatCompletionMock.mock.calls[0][0].maxTokens).toBe(16);
    });

    it('reports a rejected key as a successful HTTP outcome with the reason', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord({ isActive: true }));
      resolveActiveProviderMock.mockResolvedValue({
        adapter: { supports: () => true, sendChatCompletion: sendChatCompletionMock },
        config: { configId: 'config-1', maxTokens: 2048 },
      });
      sendChatCompletionMock.mockRejectedValue(
        new AiChatbotError('AI_PROVIDER_UNAUTHORIZED', 'AI provider rejected the API key', 401),
      );

      const actualResult = await buildService().testConnection('config-1', inputActor);

      expect(actualResult.isSuccessful).toBe(false);
      expect(actualResult.message).toContain('AI_PROVIDER_UNAUTHORIZED');
      expect(repositoryMock.recordConnectionTest).toHaveBeenCalled();
    });

    it('refuses to test an inactive config', async () => {
      repositoryMock.findConfigById.mockResolvedValue(buildRecord({ isActive: false }));

      const actualError = await buildService()
        .testConnection('config-1', inputActor)
        .catch((err: unknown) => err);

      expect(actualError).toBeInstanceOf(ConflictException);
      expect(resolveActiveProviderMock).not.toHaveBeenCalled();
    });
  });
});
