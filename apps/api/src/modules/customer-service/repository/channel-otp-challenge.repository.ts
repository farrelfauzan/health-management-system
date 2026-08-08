import { Injectable } from '@nestjs/common';

import {
  ChannelOtpChallengeRecord,
  ChannelVerificationMethodValue,
  PendingChannelBooking,
} from '@hms/shared-types';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Domain separator for the keyed hash. Without it, an OTP and a national
 * identifier that happened to be the same string would hash to the same value
 * under the same key — a collision between two unrelated lookups, and exactly
 * the kind of thing that is invisible until it is a bug report nobody can
 * reproduce.
 */
const OTP_HASH_DOMAIN = 'cs-otp:';

type ChannelOtpChallengeRow = {
  id: string;
  conversationId: string;
  method: ChannelVerificationMethodValue;
  patientId: string;
  attemptsUsed: number;
  expiresAt: Date;
  patientFullName: string;
  phoneNumber: string;
  doctorId: string;
  scheduleId: string;
  sessionDate: Date;
  note: string | null;
};

const CHALLENGE_SELECT = {
  id: true,
  conversationId: true,
  method: true,
  patientId: true,
  attemptsUsed: true,
  expiresAt: true,
  patientFullName: true,
  phoneNumber: true,
  doctorId: true,
  scheduleId: true,
  sessionDate: true,
  note: true,
} as const;

/**
 * Outstanding possession challenges (strategy §5.1.1, §8.3).
 *
 * **`codeHash` is never selected.** It is absent from `CHALLENGE_SELECT`,
 * written once, and compared once — by {@link isCodeMatching}, as a
 * `where` clause, so the comparison happens in the database and what comes
 * back is a boolean. No code hash, and certainly no code, is ever loaded into
 * a variable that a log line, a stack trace, or a provider request body could
 * pick it up from. That is what makes "the OTP code never appears in any LLM
 * request body" a property of the shape of this file rather than a rule
 * somebody has to keep obeying.
 */
@Injectable()
export class ChannelOtpChallengeRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
  ) {}

  async createChallenge(params: {
    conversationId: string;
    method: ChannelVerificationMethodValue;
    patientId: string;
    /**
     * The plaintext code, or null for a `CONTACT_SHARE` challenge. Hashing
     * happens here rather than in the caller because the crypto service is
     * repository-only by convention — and because a service that never holds a
     * hash cannot accidentally log one.
     */
    code: string | null;
    expiresAt: Date;
    pendingBooking: PendingChannelBooking;
  }): Promise<ChannelOtpChallengeRecord> {
    const row = await this.prismaService.channelOtpChallenge.create({
      data: {
        conversationId: params.conversationId,
        method: params.method,
        patientId: params.patientId,
        codeHash: params.code === null ? null : this.hashCode(params.code),
        expiresAt: params.expiresAt,
        patientFullName: params.pendingBooking.patientFullName,
        phoneNumber: params.pendingBooking.phoneNumber,
        doctorId: params.pendingBooking.doctorId,
        scheduleId: params.pendingBooking.scheduleId,
        sessionDate: new Date(`${params.pendingBooking.sessionDate}T00:00:00.000Z`),
        note: params.pendingBooking.note,
      },
      select: CHALLENGE_SELECT,
    });
    return this.toRecord(row);
  }

  /**
   * The one live challenge for a conversation, if there is one.
   *
   * "Live" means unconsumed and unexpired. An expired row is deliberately not
   * returned rather than returned-and-checked: the caller's next question is
   * always "what do I do with it", and there is no useful answer for a
   * challenge whose clock ran out except the one the absence already gives.
   */
  async findLiveChallenge(
    conversationId: string,
    now: Date,
  ): Promise<ChannelOtpChallengeRecord | null> {
    const row = await this.prismaService.channelOtpChallenge.findFirst({
      where: { conversationId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: CHALLENGE_SELECT,
    });
    return row === null ? null : this.toRecord(row);
  }

  /**
   * Whether the submitted code is the one this challenge is holding.
   *
   * The comparison is a `where` clause, so the hash never leaves this method
   * and what comes back is a boolean. Scoped by id *and* the liveness
   * conditions again, so a challenge that expired between the read above and
   * this call cannot be satisfied by a late-arriving code.
   */
  async isCodeMatching(challengeId: string, code: string, now: Date): Promise<boolean> {
    const match = await this.prismaService.channelOtpChallenge.findFirst({
      where: {
        id: challengeId,
        codeHash: this.hashCode(code),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    return match !== null;
  }

  /** Records one wrong guess and returns how many the challenge has now used. */
  async recordFailedAttempt(challengeId: string): Promise<number> {
    const row = await this.prismaService.channelOtpChallenge.update({
      where: { id: challengeId },
      data: { attemptsUsed: { increment: 1 } },
      select: { attemptsUsed: true },
    });
    return row.attemptsUsed;
  }

  /**
   * Spends a challenge — verified, exhausted, or abandoned, all the same
   * write. Once consumed it can never be satisfied again, which is what stops
   * a code that was already used, or already failed three times, from being
   * replayed a minute later.
   */
  async consumeChallenge(challengeId: string, consumedAt: Date): Promise<void> {
    await this.prismaService.channelOtpChallenge.update({
      where: { id: challengeId },
      data: { consumedAt },
    });
  }

  /** §8.3's "max 3 challenges per chat per day", counted from the same index. */
  async countChallengesSince(conversationId: string, since: Date): Promise<number> {
    return this.prismaService.channelOtpChallenge.count({
      where: { conversationId, createdAt: { gte: since } },
    });
  }

  /**
   * Keyed rather than a plain digest. A six-digit code has a million
   * possibilities — a rainbow table anyone can build in a second — so an
   * unkeyed SHA-256 of one is not meaningfully safer than storing the code
   * itself. With the HMAC key, a database dump alone cannot reverse a live
   * challenge. The key is the one the blind indexes already use, deliberately:
   * this deployment must hold and rotate exactly one such secret, and a second
   * would be a second thing to get wrong for the sake of a value that lives
   * five minutes.
   */
  private hashCode(code: string): string {
    return this.identifierCrypto.computeBlindIndex(`${OTP_HASH_DOMAIN}${code}`);
  }

  private toRecord(row: ChannelOtpChallengeRow): ChannelOtpChallengeRecord {
    return {
      id: row.id,
      conversationId: row.conversationId,
      method: row.method,
      patientId: row.patientId,
      attemptsUsed: row.attemptsUsed,
      expiresAt: row.expiresAt.toISOString(),
      pendingBooking: {
        patientFullName: row.patientFullName,
        phoneNumber: row.phoneNumber,
        doctorId: row.doctorId,
        scheduleId: row.scheduleId,
        sessionDate: row.sessionDate.toISOString().slice(0, 10),
        note: row.note,
      },
    };
  }
}
