import { Injectable } from '@nestjs/common';

import {
  AiProviderConfigRecord,
  AiProviderConnectionTestOutcome,
  CreateAiProviderConfigData,
  UpdateAiProviderConfigData,
} from '@hms/shared-types';

import { AiProviderCryptoService } from '../../../common/crypto/ai-provider-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiProviderConfig, Prisma } from '../../../generated/prisma/client';
import { AiChatbotError } from '../ai-chatbot.error';
import { AiProviderConnection } from '../infrastructure/ai-provider.types';

/**
 * Persistence for the clinic's AI provider configurations. This repository is
 * the encryption boundary: a plaintext API key is sealed here before any
 * write, ciphertext never leaves this file, and {@link getActiveConnection}
 * is the single place a stored key is ever decrypted — solely to authenticate
 * an outbound provider call. All queries target the single-tenant
 * facility-less rows (`facilityId: null`); the partial unique index from
 * P13-T01 keeps the active slot a singleton.
 */
@Injectable()
export class AiProviderConfigRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly providerCryptoService: AiProviderCryptoService,
  ) {}

  async listConfigs(): Promise<AiProviderConfigRecord[]> {
    const rows = await this.prismaService.aiProviderConfig.findMany({
      where: { facilityId: null, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findConfigById(id: string): Promise<AiProviderConfigRecord | null> {
    const row = await this.prismaService.aiProviderConfig.findFirst({
      where: { id, facilityId: null, deletedAt: null },
    });
    return row === null ? null : this.toRecord(row);
  }

  async findActiveConfig(): Promise<AiProviderConfigRecord | null> {
    const row = await this.prismaService.aiProviderConfig.findFirst({
      where: { facilityId: null, isActive: true, deletedAt: null },
    });
    return row === null ? null : this.toRecord(row);
  }

  /**
   * Creates a config staged inactive — routing chat traffic to it is a
   * separate, deliberate {@link activateConfig} call, which is what lets an
   * admin cut over between providers without a gap.
   */
  async createConfig(data: CreateAiProviderConfigData): Promise<AiProviderConfigRecord> {
    const row = await this.prismaService.aiProviderConfig.create({
      data: {
        facilityId: null,
        providerKind: data.providerKind,
        displayName: data.displayName,
        ...this.buildSealedApiKeyColumns(data.apiKey),
        baseUrl: data.baseUrl ?? null,
        defaultModel: data.defaultModel,
        isActive: false,
        isEnabled: data.isEnabled,
        maxTokens: data.maxTokens,
        timeoutMs: data.timeoutMs,
        createdById: data.createdById ?? null,
      },
    });
    return this.toRecord(row);
  }

  async updateConfig(id: string, data: UpdateAiProviderConfigData): Promise<AiProviderConfigRecord> {
    const row = await this.prismaService.aiProviderConfig.update({
      where: { id, facilityId: null, deletedAt: null },
      data: {
        displayName: data.displayName,
        ...(data.apiKey === undefined ? {} : this.buildSealedApiKeyColumns(data.apiKey)),
        baseUrl: data.baseUrl,
        defaultModel: data.defaultModel,
        isEnabled: data.isEnabled,
        maxTokens: data.maxTokens,
        timeoutMs: data.timeoutMs,
        updatedById: data.updatedById ?? null,
      },
    });
    return this.toRecord(row);
  }

  /**
   * Atomically routes chat traffic to one config: the current holder of the
   * active slot is released and the target claims it inside one transaction,
   * so the partial unique index never sees two active rows and no request
   * ever observes zero. Serialized against concurrent activations by the
   * index itself — the loser of a race fails rather than corrupting the slot.
   */
  async activateConfig(id: string, updatedById?: string | null): Promise<AiProviderConfigRecord> {
    const row = await this.prismaService.$transaction(async (transaction) => {
      await transaction.aiProviderConfig.updateMany({
        where: { facilityId: null, isActive: true, deletedAt: null, id: { not: id } },
        data: { isActive: false },
      });
      return transaction.aiProviderConfig.update({
        where: { id, facilityId: null, deletedAt: null },
        data: { isActive: true, updatedById: updatedById ?? null },
      });
    });
    return this.toRecord(row);
  }

  /**
   * Soft delete releases the active slot in the same write: the P13-T01
   * partial index only guards live rows, so a retired config must not read as
   * the one still answering chat traffic.
   */
  async softDeleteConfig(id: string): Promise<void> {
    await this.prismaService.aiProviderConfig.update({
      where: { id, facilityId: null, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async recordConnectionTest(
    id: string,
    outcome: AiProviderConnectionTestOutcome,
  ): Promise<AiProviderConfigRecord> {
    const row = await this.prismaService.aiProviderConfig.update({
      where: { id, facilityId: null, deletedAt: null },
      data: {
        lastTestedAt: outcome.testedAt,
        lastTestResult: `${outcome.isSuccessful ? 'OK' : 'FAILED'}: ${outcome.message}`,
      },
    });
    return this.toRecord(row);
  }

  /**
   * Decrypts the active config's API key into a callable connection. Callers
   * must treat the result as ephemeral — never persist, log, or return it.
   * Returns null when no config holds the active slot.
   */
  async getActiveConnection(): Promise<AiProviderConnection | null> {
    const row = await this.prismaService.aiProviderConfig.findFirst({
      where: { facilityId: null, isActive: true, deletedAt: null },
    });
    if (row === null) {
      return null;
    }
    return {
      configId: row.id,
      providerKind: row.providerKind,
      apiKey: row.apiKeyCiphertext === '' ? null : this.revealApiKey(row.apiKeyCiphertext),
      baseUrl: row.baseUrl,
      model: row.defaultModel,
      maxTokens: row.maxTokens,
      timeoutMs: row.timeoutMs,
      isEnabled: row.isEnabled,
    };
  }

  /**
   * An absent key is a legitimate stored state (keyless self-hosted Ollama),
   * persisted as empty ciphertext with an empty hint — no crypto involved, so
   * a keyless config works even on a deployment without the encryption key.
   */
  private buildSealedApiKeyColumns(
    apiKey: string | undefined,
  ): Pick<
    Prisma.AiProviderConfigUncheckedCreateInput,
    'apiKeyCiphertext' | 'apiKeyHint' | 'credentialKeyVersion'
  > {
    if (apiKey === undefined || apiKey === '') {
      return {
        apiKeyCiphertext: '',
        apiKeyHint: '',
        credentialKeyVersion: this.providerCryptoService.keyVersion,
      };
    }
    this.assertCryptoConfigured();
    return {
      apiKeyCiphertext: this.providerCryptoService.sealApiKey(apiKey).ciphertext,
      apiKeyHint: this.providerCryptoService.maskApiKey(apiKey),
      credentialKeyVersion: this.providerCryptoService.keyVersion,
    };
  }

  private revealApiKey(ciphertext: string): string {
    this.assertCryptoConfigured();
    return this.providerCryptoService.revealApiKey(ciphertext);
  }

  private assertCryptoConfigured(): void {
    if (!this.providerCryptoService.isConfigured) {
      throw new AiChatbotError(
        'AI_NOT_CONFIGURED',
        'AI_PROVIDER_ENCRYPTION_KEY is not set; AI provider API keys cannot be stored or used on this deployment',
      );
    }
  }

  private toRecord(row: AiProviderConfig): AiProviderConfigRecord {
    return {
      id: row.id,
      providerKind: row.providerKind,
      displayName: row.displayName,
      hasApiKey: row.apiKeyCiphertext !== '',
      apiKeyHint: row.apiKeyHint,
      baseUrl: row.baseUrl,
      defaultModel: row.defaultModel,
      isActive: row.isActive,
      isEnabled: row.isEnabled,
      maxTokens: row.maxTokens,
      timeoutMs: row.timeoutMs,
      lastTestedAt: row.lastTestedAt,
      lastTestResult: row.lastTestResult,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
