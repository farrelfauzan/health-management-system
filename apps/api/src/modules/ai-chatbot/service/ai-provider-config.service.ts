import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  AiProviderConfigRecord,
  AiProviderConfigView,
  AiProviderConnectionTestOutcome,
  AiProviderConnectionTestResult,
  CreateAiProviderConfigInput,
  UpdateAiProviderConfigInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { AiChatbotError } from '../ai-chatbot.error';
import { DEFAULT_AI_PROVIDER_BASE_URLS } from '../infrastructure/providers/ai-provider-base-urls';
import { AiProviderConfigRepository } from '../repository/ai-provider-config.repository';
import { AiProviderResolverService } from './ai-provider-resolver.service';

const AI_PROVIDER_AUDIT_RESOURCE = 'AiProviderConfig';
const TEST_CONNECTION_PROMPT = 'ping';
/**
 * Large enough that a reasoning model can answer at all. Vendors bill thinking
 * tokens as output and count them against `max_tokens`, so the original
 * 16-token budget was spent entirely on hidden reasoning: Gemini answered a
 * `ping` with HTTP 200, `finish_reason: length`, and **no content**, which the
 * adapter could only report as an unusable completion shape. A connection test
 * that fails on a correctly configured provider is worse than a slightly more
 * expensive one — this is a handful of tokens, once, per admin click.
 */
const TEST_CONNECTION_MAX_TOKENS = 512;
const COMPARABLE_FIELD_NAMES = [
  'displayName',
  'baseUrl',
  'defaultModel',
  'isEnabled',
  'maxTokens',
  'timeoutMs',
] as const;

/**
 * Manages the clinic's AI provider configurations (P13-T05). API keys are
 * write-only end to end: requests may carry them, views never do, and every
 * create/update/activate/delete/test emits an audit event that names changed
 * fields but never values. Per-kind requiredness lives here rather than in
 * the Zod schema because it depends on `providerKind`: the same rules the
 * resolver enforces at call time are enforced at write time, so a
 * misconfigured provider is rejected by the admin screen instead of by the
 * first patient message.
 */
@Injectable()
export class AiProviderConfigService {
  constructor(
    private readonly configRepository: AiProviderConfigRepository,
    private readonly resolverService: AiProviderResolverService,
    private readonly auditService: AuditService,
  ) {}

  async listConfigs(): Promise<AiProviderConfigView[]> {
    const records = await this.configRepository.listConfigs();
    return records.map((record) => this.toView(record));
  }

  async createConfig(
    input: CreateAiProviderConfigInput,
    actor: CurrentUser,
  ): Promise<AiProviderConfigView> {
    this.assertApiKeyPresence(input.providerKind, input.apiKey);
    this.assertBaseUrlPresence(input.providerKind, input.baseUrl);
    const record = await this.executeCryptoDependentWrite(() =>
      this.configRepository.createConfig({ ...input, createdById: actor.sub }),
    );
    await this.auditService.record({
      action: 'AI_PROVIDER_CONFIG_CREATED',
      resource: AI_PROVIDER_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { providerKind: record.providerKind, hasApiKey: record.hasApiKey },
    });
    return this.toView(record);
  }

  async updateConfig(
    id: string,
    input: UpdateAiProviderConfigInput,
    actor: CurrentUser,
  ): Promise<AiProviderConfigView> {
    const existing = await this.requireConfig(id);
    // A cleared baseUrl must still leave the kind with somewhere to call.
    if (input.baseUrl === null) {
      this.assertBaseUrlPresence(existing.providerKind, undefined);
    }
    const changedFields = this.collectChangedFields(existing, input);
    const record = await this.executeCryptoDependentWrite(() =>
      this.configRepository.updateConfig(id, { ...input, updatedById: actor.sub }),
    );
    await this.auditService.record({
      action: 'AI_PROVIDER_CONFIG_UPDATED',
      resource: AI_PROVIDER_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { changedFields },
    });
    return this.toView(record);
  }

  /**
   * Routes chat traffic to one config. Validation runs before the swap:
   * activating a config that the resolver would reject would take chat down
   * with `AI_NOT_CONFIGURED` on the next message, so the failure belongs at
   * the admin's click instead.
   */
  async activateConfig(id: string, actor: CurrentUser): Promise<AiProviderConfigView> {
    const existing = await this.requireConfig(id);
    this.assertApiKeyPresence(existing.providerKind, existing.hasApiKey ? 'stored' : undefined);
    this.assertBaseUrlPresence(existing.providerKind, existing.baseUrl ?? undefined);
    const record = await this.configRepository.activateConfig(id, actor.sub);
    await this.auditService.record({
      action: 'AI_PROVIDER_CONFIG_ACTIVATED',
      resource: AI_PROVIDER_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { providerKind: record.providerKind },
    });
    return this.toView(record);
  }

  /**
   * Retires a config. The active one is refused: soft-deleting it would
   * leave chat with no provider, so an admin must activate a replacement
   * first — the ordering that makes a cutover gapless.
   */
  async deleteConfig(id: string, actor: CurrentUser): Promise<{ id: string }> {
    const existing = await this.requireConfig(id);
    if (existing.isActive) {
      throw new ConflictException(
        'The active AI provider configuration cannot be deleted; activate another configuration first',
      );
    }
    await this.configRepository.softDeleteConfig(id);
    await this.auditService.record({
      action: 'AI_PROVIDER_CONFIG_DELETED',
      resource: AI_PROVIDER_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      metadata: { providerKind: existing.providerKind },
    });
    return { id };
  }

  /**
   * Sends a minimal completion through the real adapter path to prove the
   * key, base URL, and model together. No chat session is created and the
   * prompt is a bare "ping" — the point is reachability, not an answer.
   * Only the active config can be tested: the resolver reads the active
   * slot, which is also what a patient message would use.
   */
  async testConnection(id: string, actor: CurrentUser): Promise<AiProviderConnectionTestResult> {
    const existing = await this.requireConfig(id);
    if (!existing.isActive) {
      throw new ConflictException(
        'Only the active AI provider configuration can be tested; activate it first',
      );
    }
    const outcome = await this.performConnectionTest();
    await this.configRepository.recordConnectionTest(existing.id, outcome);
    await this.auditService.record({
      action: 'AI_PROVIDER_CONNECTION_TESTED',
      resource: AI_PROVIDER_AUDIT_RESOURCE,
      resourceId: existing.id,
      actorUserId: actor.sub,
      metadata: { isSuccessful: outcome.isSuccessful, providerKind: existing.providerKind },
    });
    return {
      isSuccessful: outcome.isSuccessful,
      message: outcome.message,
      testedAt: outcome.testedAt.toISOString(),
    };
  }

  private async performConnectionTest(): Promise<AiProviderConnectionTestOutcome> {
    const testedAt = new Date();
    try {
      const { adapter, config } = await this.resolverService.resolveActiveProvider();
      const result = await adapter.sendChatCompletion(
        { ...config, maxTokens: TEST_CONNECTION_MAX_TOKENS },
        {
          sessionExternalId: null,
          channel: 'PATIENT',
          messages: [{ role: 'user', content: TEST_CONNECTION_PROMPT }],
          contextPayload: {},
        },
      );
      return {
        isSuccessful: true,
        message: `Provider accepted the credentials and answered with model ${result.model}`,
        testedAt,
      };
    } catch (caughtError) {
      if (!(caughtError instanceof AiChatbotError)) {
        throw caughtError;
      }
      return {
        isSuccessful: false,
        message: `${caughtError.code}: ${caughtError.message}`,
        testedAt,
      };
    }
  }

  private assertApiKeyPresence(providerKind: string, apiKey: string | undefined): void {
    if (providerKind === 'OLLAMA' || apiKey !== undefined) {
      return;
    }
    throw new BadRequestException(`Provider kind ${providerKind} requires an API key`);
  }

  private assertBaseUrlPresence(providerKind: string, baseUrl: string | undefined): void {
    if (baseUrl !== undefined) {
      return;
    }
    const vendorDefault =
      DEFAULT_AI_PROVIDER_BASE_URLS[providerKind as keyof typeof DEFAULT_AI_PROVIDER_BASE_URLS];
    if (vendorDefault === null || vendorDefault === undefined) {
      throw new BadRequestException(
        `Provider kind ${providerKind} requires an explicit base URL`,
      );
    }
  }

  private collectChangedFields(
    existing: AiProviderConfigRecord,
    input: UpdateAiProviderConfigInput,
  ): string[] {
    const changedComparableFields = COMPARABLE_FIELD_NAMES.filter(
      (fieldName) => input[fieldName] !== undefined && input[fieldName] !== existing[fieldName],
    );
    return [...changedComparableFields, ...(input.apiKey === undefined ? [] : ['apiKey'])];
  }

  private async requireConfig(id: string): Promise<AiProviderConfigRecord> {
    const record = await this.configRepository.findConfigById(id);
    if (record === null) {
      throw new NotFoundException('AI provider configuration not found');
    }
    return record;
  }

  private async executeCryptoDependentWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (caughtError) {
      if (caughtError instanceof AiChatbotError && caughtError.code === 'AI_NOT_CONFIGURED') {
        throw new ServiceUnavailableException(caughtError.message);
      }
      throw caughtError;
    }
  }

  private toView(record: AiProviderConfigRecord): AiProviderConfigView {
    return {
      id: record.id,
      providerKind: record.providerKind,
      displayName: record.displayName,
      hasApiKey: record.hasApiKey,
      apiKeyHint: record.apiKeyHint,
      baseUrl: record.baseUrl,
      defaultModel: record.defaultModel,
      isActive: record.isActive,
      isEnabled: record.isEnabled,
      maxTokens: record.maxTokens,
      timeoutMs: record.timeoutMs,
      lastTestedAt: record.lastTestedAt === null ? null : record.lastTestedAt.toISOString(),
      lastTestResult: record.lastTestResult,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
