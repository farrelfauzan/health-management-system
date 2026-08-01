import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

import {
  BpjsAntreanConfigRecord,
  BpjsAntreanConnectionTestOutcome,
  CreateBpjsAntreanConfigData,
  SaveBpjsAntreanConfigData,
} from '@hms/shared-types';

import { BpjsAntreanError } from '../../../common/bpjs-antrean/bpjs-antrean.error';
import {
  BpjsAntreanConnection,
  BpjsAntreanInboundTokenMaterial,
} from '../../../common/bpjs-antrean/bpjs-antrean.types';
import { BpjsCredentialCryptoService } from '../../../common/crypto/bpjs-credential-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsAntreanConfig } from '../../../generated/prisma/client';

const INBOUND_PASSWORD_SALT_ROUNDS = 10;
const INBOUND_TOKEN_KEY_LABEL = 'bpjs-antrean-inbound-token-signing-key-v1';
const INBOUND_FINGERPRINT_LABEL = 'bpjs-antrean-inbound-credential-fingerprint-v1';
const INBOUND_FINGERPRINT_LENGTH = 16;

/**
 * Persistence for the facility's Antrean Online bridging credentials. This
 * repository is the encryption boundary: the two outbound keys are sealed
 * here before any write, ciphertext never leaves this file, and
 * {@link getConnection} is the single place a stored credential is ever
 * decrypted — solely to sign an outbound Antrean call.
 *
 * The inbound password is *hashed*, not sealed, and there is deliberately no
 * method that reads it back: HMS only ever verifies what BPJS presents to the
 * token endpoint (P14-T04), so a reversible secret would be strictly more
 * dangerous with no use for the extra capability.
 *
 * All queries target the single-tenant facility-less row (`facilityId: null`);
 * the partial unique index keeps it a singleton.
 */
@Injectable()
export class BpjsAntreanConfigRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly credentialCryptoService: BpjsCredentialCryptoService,
  ) {}

  async findConfig(): Promise<BpjsAntreanConfigRecord | null> {
    const row = await this.prismaService.bpjsAntreanConfig.findFirst({
      where: { facilityId: null },
    });
    return row === null ? null : this.toRecord(row);
  }

  async createConfig(data: CreateBpjsAntreanConfigData): Promise<BpjsAntreanConfigRecord> {
    this.assertCryptoConfigured();
    const sealedSecretKey = this.credentialCryptoService.sealCredential(data.secretKey);
    const sealedUserKey = this.credentialCryptoService.sealCredential(data.userKey);
    const row = await this.prismaService.bpjsAntreanConfig.create({
      data: {
        facilityId: null,
        environment: data.environment,
        consId: data.consId,
        kdProviderPpk: data.kdProviderPpk,
        secretKeyCiphertext: sealedSecretKey.ciphertext,
        secretKeyLast4: this.credentialCryptoService.maskCredential(data.secretKey),
        userKeyCiphertext: sealedUserKey.ciphertext,
        userKeyLast4: this.credentialCryptoService.maskCredential(data.userKey),
        inboundUsername: data.inboundUsername ?? null,
        inboundPasswordHash: await this.hashInboundPassword(data.inboundPassword),
        credentialKeyVersion: this.credentialCryptoService.keyVersion,
        isActive: data.isActive,
      },
    });
    return this.toRecord(row);
  }

  async updateConfig(
    id: string,
    data: SaveBpjsAntreanConfigData,
  ): Promise<BpjsAntreanConfigRecord> {
    if (data.secretKey !== undefined || data.userKey !== undefined) {
      this.assertCryptoConfigured();
    }
    const row = await this.prismaService.bpjsAntreanConfig.update({
      where: { id },
      data: {
        environment: data.environment,
        consId: data.consId,
        kdProviderPpk: data.kdProviderPpk,
        isActive: data.isActive,
        ...(data.inboundUsername === undefined ? {} : { inboundUsername: data.inboundUsername }),
        ...(data.inboundPassword === undefined
          ? {}
          : { inboundPasswordHash: await this.hashInboundPassword(data.inboundPassword) }),
        ...this.buildSealedSecretUpdate(data),
      },
    });
    return this.toRecord(row);
  }

  async deleteConfig(id: string): Promise<void> {
    await this.prismaService.bpjsAntreanConfig.delete({ where: { id } });
  }

  /**
   * Decrypts the stored outbound credentials into a signable connection.
   * Callers must treat the result as ephemeral — never persist, log, or
   * return it.
   */
  async getConnection(): Promise<BpjsAntreanConnection | null> {
    const row = await this.prismaService.bpjsAntreanConfig.findFirst({
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
      },
    };
  }

  /**
   * Verifies the credential pair BPJS presents to the facility's token
   * endpoint (P14-T04). The comparison happens *here*, inside the encryption
   * boundary, precisely so the stored hash still has no way out of this file.
   *
   * The username is compared in constant time alongside the password: the
   * endpoint is reachable from the public internet, and a short-circuit on a
   * wrong username would make usernames enumerable by timing. bcrypt is run
   * even when the username does not match, for the same reason — a mismatched
   * username must cost the same as a mismatched password.
   */
  async verifyInboundCredentials(params: {
    username: string;
    password: string;
  }): Promise<boolean> {
    const row = await this.prismaService.bpjsAntreanConfig.findFirst({
      where: { facilityId: null },
    });
    if (row === null || row.inboundUsername === null || row.inboundPasswordHash === null) {
      return false;
    }
    const isUsernameValid = this.matchesInConstantTime(params.username, row.inboundUsername);
    const isPasswordValid = await compare(params.password, row.inboundPasswordHash);
    return isUsernameValid && isPasswordValid;
  }

  /**
   * Derives the inbound token signing key and credential fingerprint from the
   * stored password hash. Returns null when no inbound credential is stored,
   * which is one of the two conditions that keep the inbound surface dark.
   */
  async getInboundTokenMaterial(): Promise<BpjsAntreanInboundTokenMaterial | null> {
    const row = await this.prismaService.bpjsAntreanConfig.findFirst({
      where: { facilityId: null },
      select: { inboundPasswordHash: true },
    });
    if (row === null || row.inboundPasswordHash === null) {
      return null;
    }
    return {
      signingKey: createHmac('sha256', INBOUND_TOKEN_KEY_LABEL)
        .update(row.inboundPasswordHash)
        .digest(),
      credentialFingerprint: createHmac('sha256', INBOUND_FINGERPRINT_LABEL)
        .update(row.inboundPasswordHash)
        .digest('hex')
        .slice(0, INBOUND_FINGERPRINT_LENGTH),
    };
  }

  private matchesInConstantTime(candidate: string, expected: string): boolean {
    const candidateBytes = Buffer.from(candidate, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (candidateBytes.length !== expectedBytes.length) {
      return false;
    }
    return timingSafeEqual(candidateBytes, expectedBytes);
  }

  async recordConnectionTest(
    id: string,
    outcome: BpjsAntreanConnectionTestOutcome,
  ): Promise<BpjsAntreanConfigRecord> {
    const row = await this.prismaService.bpjsAntreanConfig.update({
      where: { id },
      data: {
        lastTestedAt: outcome.testedAt,
        lastTestResult: `${outcome.isSuccessful ? 'OK' : 'FAILED'}: ${outcome.message}`,
      },
    });
    return this.toRecord(row);
  }

  private async hashInboundPassword(inboundPassword?: string): Promise<string | null> {
    if (inboundPassword === undefined) {
      return null;
    }
    return hash(inboundPassword, INBOUND_PASSWORD_SALT_ROUNDS);
  }

  private buildSealedSecretUpdate(data: SaveBpjsAntreanConfigData): Record<string, unknown> {
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
    return update;
  }

  private assertCryptoConfigured(): void {
    if (!this.credentialCryptoService.isConfigured) {
      throw new BpjsAntreanError(
        'BPJS_ANTREAN_NOT_CONFIGURED',
        'BPJS_CREDENTIAL_ENCRYPTION_KEY is not set; BPJS credentials cannot be stored or used on this deployment',
      );
    }
  }

  private toRecord(row: BpjsAntreanConfig): BpjsAntreanConfigRecord {
    return {
      id: row.id,
      environment: row.environment,
      consId: row.consId,
      kdProviderPpk: row.kdProviderPpk,
      secretKeyLast4: row.secretKeyLast4,
      userKeyLast4: row.userKeyLast4,
      inboundUsername: row.inboundUsername,
      hasInboundPassword: row.inboundPasswordHash !== null,
      isActive: row.isActive,
      lastTestedAt: row.lastTestedAt,
      lastTestResult: row.lastTestResult,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
