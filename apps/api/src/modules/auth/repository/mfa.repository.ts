import { Injectable } from '@nestjs/common';

import {
  MfaCredentialPayload,
  MfaCredentialSnapshot,
  MfaRecoveryCodePayload,
} from '@hms/shared-types';

import { MfaCryptoService } from '../../../common/crypto/mfa-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class MfaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaCrypto: MfaCryptoService,
  ) {}

  /**
   * Replaces any existing credential for the user, verified or not.
   *
   * An upsert rather than an insert because re-enrolling is ordinary — a new
   * phone, a wiped authenticator — and accumulating secrets would leave the
   * question of which one is live to be answered by a timestamp comparison
   * somewhere else. Overwriting also clears `verifiedAt` and the replay
   * counter, which is correct: a fresh secret has proved nothing yet, and the
   * old counter belongs to a code sequence that no longer exists.
   */
  async upsertCredential(payload: MfaCredentialPayload): Promise<void> {
    const sealed = this.mfaCrypto.sealTotpSecret(payload.secret);
    await this.prisma.mfaCredential.upsert({
      where: { userId: payload.userId },
      create: {
        userId: payload.userId,
        secretEncrypted: sealed.ciphertext,
        keyVersion: sealed.keyVersion,
      },
      update: {
        secretEncrypted: sealed.ciphertext,
        keyVersion: sealed.keyVersion,
        verifiedAt: null,
        lastAcceptedTimeStep: null,
      },
    });
  }

  /**
   * The credential with its secret decrypted. Returns null when there is no
   * row — and *throws* when there is a row the current key cannot open, which
   * is a misconfigured or rotated key, not an absent second factor. Reporting
   * that as "no MFA enrolled" would silently disable the control.
   */
  async findCredentialSnapshot(userId: string): Promise<MfaCredentialSnapshot | null> {
    const credential = await this.prisma.mfaCredential.findUnique({
      where: { userId },
      select: {
        userId: true,
        secretEncrypted: true,
        verifiedAt: true,
        lastAcceptedTimeStep: true,
      },
    });
    if (!credential) {
      return null;
    }
    return {
      userId: credential.userId,
      secret: this.mfaCrypto.revealTotpSecret(credential.secretEncrypted),
      verifiedAt: credential.verifiedAt,
      lastAcceptedTimeStep:
        credential.lastAcceptedTimeStep === null ? null : Number(credential.lastAcceptedTimeStep),
    };
  }

  /** Cheap existence check for the enforcement path, which needs no secret. */
  async findVerifiedAt(userId: string): Promise<Date | null> {
    const credential = await this.prisma.mfaCredential.findUnique({
      where: { userId },
      select: { verifiedAt: true },
    });
    return credential?.verifiedAt ?? null;
  }

  /**
   * Marks the credential verified and records the time step in one write, so
   * the code that activated enrolment cannot also be replayed against the
   * challenge endpoint a second later.
   */
  async markCredentialVerified(userId: string, acceptedTimeStep: number): Promise<void> {
    await this.prisma.mfaCredential.update({
      where: { userId },
      data: { verifiedAt: new Date(), lastAcceptedTimeStep: BigInt(acceptedTimeStep) },
    });
  }

  /**
   * Advances the replay watermark, and only ever forwards.
   *
   * The `lt` filter makes the database the arbiter when two requests race:
   * both may verify the same code against the same snapshot, but exactly one
   * moves the watermark, and the loser's own `updateMany` reports zero rows.
   * The caller treats that as a replay, which it is.
   */
  async advanceAcceptedTimeStep(userId: string, acceptedTimeStep: number): Promise<boolean> {
    const advanced = await this.prisma.mfaCredential.updateMany({
      where: {
        userId,
        OR: [
          { lastAcceptedTimeStep: null },
          { lastAcceptedTimeStep: { lt: BigInt(acceptedTimeStep) } },
        ],
      },
      data: { lastAcceptedTimeStep: BigInt(acceptedTimeStep) },
    });
    return advanced.count === 1;
  }

  async deleteCredential(userId: string): Promise<void> {
    await this.prisma.mfaCredential.deleteMany({ where: { userId } });
  }

  /**
   * Issues a fresh set, discarding whatever came before — including codes
   * already spent, whose `usedAt` history goes with them. The alternative,
   * keeping spent rows forever, grows without bound and answers a question
   * (`which code was used in 2024`) that the audit log already answers better.
   */
  async replaceRecoveryCodes(userId: string, payloads: MfaRecoveryCodePayload[]): Promise<void> {
    await this.prisma.executeTransaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({ data: payloads });
    });
  }

  /**
   * Spends one recovery code, atomically.
   *
   * The `usedAt: null` filter is the single-use guarantee: two requests
   * presenting the same code both match the hash, and exactly one updates a
   * row. Matching on the hash rather than scanning the user's codes also means
   * the comparison happens in an index, not in application code where an
   * early-exit loop would leak timing.
   */
  async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const consumed = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1;
  }

  async countUnusedRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  async deleteRecoveryCodes(userId: string): Promise<void> {
    await this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
  }
}
