import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_PROVIDER_KINDS, AiProviderKindValue } from '@hms/shared-types';

import { AiChatbotError } from '../ai-chatbot.error';
import {
  AiProviderConnection,
  ResolvedAiProviderConfig,
} from '../infrastructure/ai-provider.types';
import { AiChatProvider } from '../infrastructure/providers/ai-chat-provider.interface';
import { DEFAULT_AI_PROVIDER_BASE_URLS } from '../infrastructure/providers/ai-provider-base-urls';
import { AiProviderRegistry } from '../infrastructure/providers/ai-provider-registry.service';
import { AiProviderConfigRepository } from '../repository/ai-provider-config.repository';

/**
 * Sentinel config id for the deployment-level env fallback (§4.3.3): it has
 * no database row, but the circuit breaker and audit trail still need a
 * stable key.
 */
const PLATFORM_ENV_CONFIG_ID = 'platform-env';
const DEFAULT_PLATFORM_TIMEOUT_MS = 30_000;
const DEFAULT_PLATFORM_MAX_TOKENS = 2_048;
/**
 * Model ids across the six kinds are short vendor slugs (`gpt-4o-mini`,
 * `deepseek-chat`, `llama3.2:latest`, Azure deployment names) — allow only
 * the characters those use so a config can never smuggle URL syntax or
 * header-breaking characters into an adapter's request path.
 */
const MODEL_ALLOWLIST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/:-]{0,127}$/;

export type ResolvedAiProvider = {
  adapter: AiChatProvider;
  config: ResolvedAiProviderConfig;
};

/**
 * Turns "whatever this deployment has configured" into a validated,
 * callable provider: loads the clinic's active config through the
 * repository's single decrypt point, falls back to the `AI_PLATFORM_*` env
 * defaults when no config row exists (dev/single-tenant), and enforces the
 * per-kind rules the repository deliberately does not know — key
 * requiredness, base-URL defaults, and the model allowlist. Every rejection
 * is `AI_NOT_CONFIGURED`: from the chat endpoint's point of view there is
 * simply no provider to talk to until an admin fixes the config.
 */
@Injectable()
export class AiProviderResolverService {
  constructor(
    private readonly configRepository: AiProviderConfigRepository,
    private readonly registry: AiProviderRegistry,
    private readonly configService: ConfigService,
  ) {}

  async resolveActiveProvider(): Promise<ResolvedAiProvider> {
    const connection =
      (await this.configRepository.getActiveConnection()) ?? this.buildPlatformFallback();
    if (!connection.isEnabled) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        'The active AI provider configuration is disabled',
      );
    }
    const config = this.validateConnection(connection);
    return { adapter: this.registry.resolveAdapter(config.providerKind), config };
  }

  private buildPlatformFallback(): AiProviderConnection {
    const kind = this.readOptionalValue('AI_PLATFORM_PROVIDER_KIND');
    const model = this.readOptionalValue('AI_PLATFORM_MODEL');
    if (kind === undefined || model === undefined) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        'No active AI provider configuration exists for this facility',
      );
    }
    if (!this.isKnownProviderKind(kind)) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        `AI_PLATFORM_PROVIDER_KIND must be one of ${AI_PROVIDER_KINDS.join(', ')}`,
      );
    }
    return {
      configId: PLATFORM_ENV_CONFIG_ID,
      providerKind: kind,
      apiKey: this.readOptionalValue('AI_PLATFORM_API_KEY') ?? null,
      baseUrl: this.readOptionalValue('AI_PLATFORM_BASE_URL') ?? null,
      model,
      maxTokens: DEFAULT_PLATFORM_MAX_TOKENS,
      timeoutMs: this.readTimeoutMs(),
      isEnabled: true,
    };
  }

  private validateConnection(connection: AiProviderConnection): ResolvedAiProviderConfig {
    const baseUrl = connection.baseUrl ?? DEFAULT_AI_PROVIDER_BASE_URLS[connection.providerKind];
    if (baseUrl === null) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        `Provider kind ${connection.providerKind} requires an explicit base URL`,
      );
    }
    if (connection.apiKey === null && connection.providerKind !== 'OLLAMA') {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        `Provider kind ${connection.providerKind} requires an API key`,
      );
    }
    if (!MODEL_ALLOWLIST_PATTERN.test(connection.model)) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        'The configured model id contains unsupported characters',
      );
    }
    return {
      configId: connection.configId,
      providerKind: connection.providerKind,
      apiKey: connection.apiKey,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      model: connection.model,
      maxTokens: connection.maxTokens,
      timeoutMs: connection.timeoutMs,
    };
  }

  private isKnownProviderKind(value: string): value is AiProviderKindValue {
    return (AI_PROVIDER_KINDS as readonly string[]).includes(value);
  }

  private readOptionalValue(key: string): string | undefined {
    const rawValue = this.configService.get<string>(key)?.trim();
    return rawValue === undefined || rawValue === '' ? undefined : rawValue;
  }

  private readTimeoutMs(): number {
    const rawValue = this.readOptionalValue('AI_PROVIDER_TIMEOUT_MS');
    if (rawValue === undefined) {
      return DEFAULT_PLATFORM_TIMEOUT_MS;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        'AI_PROVIDER_TIMEOUT_MS must be a positive integer',
      );
    }
    return parsed;
  }
}
