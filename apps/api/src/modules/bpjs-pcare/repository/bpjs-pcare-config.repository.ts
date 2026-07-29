import { Injectable } from '@nestjs/common';

import {
  BpjsPcareConfigRecord,
  BpjsPcareConnectionTestOutcome,
  CreateBpjsPcareConfigData,
  SaveBpjsPcareConfigData,
} from '@hms/shared-types';

import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsPcareConnection } from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { BpjsCredentialCryptoService } from '../../../common/crypto/bpjs-credential-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsPcareConfig } from '../../../generated/prisma/client';

/**
 * Persistence for the facility's PCare bridging credentials. This repository
 * is the encryption boundary: plaintext secrets are sealed here before any
 * write, ciphertext never leaves this file, and {@link getConnection} is the
 * single place a stored credential is ever decrypted — solely to sign an
 * outbound PCare call. All queries target the single-tenant facility-less
 * row (`facilityId: null`); the partial unique index keeps it a singleton.
 */
@Injectable()
export class BpjsPcareConfigRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly credentialCryptoService: BpjsCredentialCryptoService,
  ) {}

  async findConfig(): Promise<BpjsPcareConfigRecord | null> {
    const row = await this.prismaService.bpjsPcareConfig.findFirst({
      where: { facilityId: null },
    });
    return row === null ? null : this.toRecord(row);
  }

  async createConfig(data: CreateBpjsPcareConfigData): Promise<BpjsPcareConfigRecord> {
    this.assertCryptoConfigured();
    const sealedSecretKey = this.credentialCryptoService.sealCredential(data.secretKey);
    const sealedUserKey = this.credentialCryptoService.sealCredential(data.userKey);
    const sealedPassword = this.credentialCryptoService.sealCredential(data.pcarePassword);
    const row = await this.prismaService.bpjsPcareConfig.create({
      data: {
        facilityId: null,
        environment: data.environment,
        consId: data.consId,
        kdProviderPpk: data.kdProviderPpk,
        pcareUsername: data.pcareUsername,
        secretKeyCiphertext: sealedSecretKey.ciphertext,
        secretKeyLast4: this.credentialCryptoService.maskCredential(data.secretKey),
        userKeyCiphertext: sealedUserKey.ciphertext,
        userKeyLast4: this.credentialCryptoService.maskCredential(data.userKey),
        pcarePasswordCiphertext: sealedPassword.ciphertext,
        credentialKeyVersion: this.credentialCryptoService.keyVersion,
        isActive: data.isActive,
      },
    });
    return this.toRecord(row);
  }

  async updateConfig(id: string, data: SaveBpjsPcareConfigData): Promise<BpjsPcareConfigRecord> {
    if (
      data.secretKey !== undefined ||
      data.userKey !== undefined ||
      data.pcarePassword !== undefined
    ) {
      this.assertCryptoConfigured();
    }
    const row = await this.prismaService.bpjsPcareConfig.update({
      where: { id },
      data: {
        environment: data.environment,
        consId: data.consId,
        kdProviderPpk: data.kdProviderPpk,
        pcareUsername: data.pcareUsername,
        isActive: data.isActive,
        ...this.buildSealedSecretUpdate(data),
      },
    });
    return this.toRecord(row);
  }

  async deleteConfig(id: string): Promise<void> {
    await this.prismaService.bpjsPcareConfig.delete({ where: { id } });
  }

  /**
   * Decrypts the stored credentials into a signable connection. Callers must
   * treat the result as ephemeral — never persist, log, or return it.
   */
  async getConnection(): Promise<BpjsPcareConnection | null> {
    const row = await this.prismaService.bpjsPcareConfig.findFirst({
      where: { facilityId: null },
    });
    if (row === null) {
      return null;
    }
    this.assertCryptoConfigured();
    return {
      environment: row.environment,
      credentials: {
        consId: row.consId,
        secretKey: this.credentialCryptoService.revealCredential(row.secretKeyCiphertext),
        userKey: this.credentialCryptoService.revealCredential(row.userKeyCiphertext),
        pcareUsername: row.pcareUsername,
        pcarePassword: this.credentialCryptoService.revealCredential(row.pcarePasswordCiphertext),
      },
    };
  }

  async recordConnectionTest(
    id: string,
    outcome: BpjsPcareConnectionTestOutcome,
  ): Promise<BpjsPcareConfigRecord> {
    const row = await this.prismaService.bpjsPcareConfig.update({
      where: { id },
      data: {
        lastTestedAt: outcome.testedAt,
        lastTestResult: `${outcome.isSuccessful ? 'OK' : 'FAILED'}: ${outcome.message}`,
      },
    });
    return this.toRecord(row);
  }

  private buildSealedSecretUpdate(data: SaveBpjsPcareConfigData): Record<string, unknown> {
    const update: Record<string, unknown> = {};
    if (data.secretKey !== undefined) {
      update.secretKeyCiphertext = this.credentialCryptoService.sealCredential(
        data.secretKey,
      ).ciphertext;
      update.secretKeyLast4 = this.credentialCryptoService.maskCredential(data.secretKey);
      update.credentialKeyVersion = this.credentialCryptoService.keyVersion;
    }
    if (data.userKey !== undefined) {
      update.userKeyCiphertext = this.credentialCryptoService.sealCredential(
        data.userKey,
      ).ciphertext;
      update.userKeyLast4 = this.credentialCryptoService.maskCredential(data.userKey);
      update.credentialKeyVersion = this.credentialCryptoService.keyVersion;
    }
    if (data.pcarePassword !== undefined) {
      update.pcarePasswordCiphertext = this.credentialCryptoService.sealCredential(
        data.pcarePassword,
      ).ciphertext;
      update.credentialKeyVersion = this.credentialCryptoService.keyVersion;
    }
    return update;
  }

  private assertCryptoConfigured(): void {
    if (!this.credentialCryptoService.isConfigured) {
      throw new BpjsPcareError(
        'BPJS_PCARE_NOT_CONFIGURED',
        'BPJS_CREDENTIAL_ENCRYPTION_KEY is not set; BPJS credentials cannot be stored or used on this deployment',
      );
    }
  }

  private toRecord(row: BpjsPcareConfig): BpjsPcareConfigRecord {
    return {
      id: row.id,
      environment: row.environment,
      consId: row.consId,
      kdProviderPpk: row.kdProviderPpk,
      pcareUsername: row.pcareUsername,
      secretKeyLast4: row.secretKeyLast4,
      userKeyLast4: row.userKeyLast4,
      isActive: row.isActive,
      lastTestedAt: row.lastTestedAt,
      lastTestResult: row.lastTestResult,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
