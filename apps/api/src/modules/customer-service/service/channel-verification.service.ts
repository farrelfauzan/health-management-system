import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChannelKindValue,
  ChannelOtpChallengeRecord,
  ChannelVerificationMethodValue,
  CustomerServiceConfig,
  PendingChannelBooking,
  SharedContact,
} from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { resolveCustomerServiceConfig } from '../customer-service.config';
import { ChannelOtpChallengeRepository } from '../repository/channel-otp-challenge.repository';
import { normalizePhoneNumber } from './normalize-phone-number';
import { generateOtpCode } from './otp-code';
import { OtpDeliveryService } from './otp-delivery.service';

const DAY_IN_MS = 86_400_000;

/**
 * Issues and resolves §5.1.1's possession challenges.
 *
 * **Everything here is a comparison and a clock.** No method on this class
 * calls a provider, and none of them takes model output as an argument — the
 * conversation is parked in `AWAITING_OTP` precisely so that inbound messages
 * reach these string comparisons instead of a prompt. That is what makes
 * "prompt injection cannot talk its way past verification" a property of the
 * control flow rather than an instruction in a system prompt.
 *
 * The two tiers this slice can actually run differ in what they cost the
 * customer and in what they depend on:
 *
 * - **Contact share** is Telegram-only, one tap, and needs no transport at
 *   all — Telegram signs the card. It is the tier the pilot runs on.
 * - **OTP** needs a way to reach the *registered* number, which is the whole
 *   proof, and Telegram cannot message a phone number. {@link OtpDeliveryService}
 *   is therefore unbound in this slice and this service treats that as "this
 *   customer cannot be challenged by code", falling through to the draft path
 *   — the same outcome §5.1.1 already prescribes for a customer who declines.
 */
@Injectable()
export class ChannelVerificationService {
  private readonly logger = new Logger(ChannelVerificationService.name);
  private readonly serviceConfig: CustomerServiceConfig;

  constructor(
    configService: ConfigService,
    private readonly challengeRepository: ChannelOtpChallengeRepository,
    // Unbound until `PCS-T09`, exactly like `WhatsappGatewayService` in the
    // gateway's dispatcher. `@Optional()` rather than a default parameter
    // because Nest resolves by token and would otherwise refuse to construct
    // this service at all.
    @Optional() private readonly otpDelivery: OtpDeliveryService | null = null,
  ) {
    this.serviceConfig = resolveCustomerServiceConfig(configService);
  }

  /**
   * Which proof, if any, this conversation can be asked for.
   *
   * Returns null when no challenge can be issued — either the channel offers
   * no usable tier, or §8.3's daily challenge quota is spent. A null is not an
   * error: it means the booking proceeds as a draft, which is a complete and
   * intended outcome, not a degraded one.
   */
  async resolveAvailableMethod(params: {
    conversationId: string;
    channel: ChannelKindValue;
    now: Date;
  }): Promise<ChannelVerificationMethodValue | null> {
    const challengesToday = await this.challengeRepository.countChallengesSince(
      params.conversationId,
      new Date(params.now.getTime() - DAY_IN_MS),
    );
    if (challengesToday >= this.serviceConfig.booking.otpMaxChallengesPerDay) {
      // §8.3: repeated challenges against the same chat are what enumeration
      // looks like. Logged without the chat's contents so the count is
      // reviewable and the conversation is not.
      this.logger.warn(
        `Verification challenge quota reached for conversation ${params.conversationId}`,
      );
      return null;
    }
    if (params.channel === 'TELEGRAM') {
      return 'CONTACT_SHARE';
    }
    return this.otpDelivery === null ? null : 'OTP';
  }

  /**
   * Opens a challenge and, for the OTP tier, sends the code.
   *
   * Returns null when the code could not be delivered. The order matters: the
   * challenge row is written first so the code that goes out is the code
   * stored, and a delivery failure then *consumes* the row rather than leaving
   * a live challenge nobody can satisfy — a customer waiting five minutes for
   * a code that was never sent is a worse failure than falling straight
   * through to a draft booking.
   */
  async issueChallenge(params: {
    conversationId: string;
    method: ChannelVerificationMethodValue;
    patientId: string;
    pendingBooking: PendingChannelBooking;
    now: Date;
  }): Promise<ChannelOtpChallengeRecord | null> {
    const code = params.method === 'OTP' ? generateOtpCode() : null;
    const challenge = await this.challengeRepository.createChallenge({
      conversationId: params.conversationId,
      method: params.method,
      patientId: params.patientId,
      code,
      expiresAt: new Date(params.now.getTime() + this.serviceConfig.booking.otpTtlSeconds * 1000),
      pendingBooking: params.pendingBooking,
    });
    if (code === null) {
      return challenge;
    }
    try {
      await this.requireOtpDelivery().sendVerificationCode({
        // The code goes to the number **on the patient's record**, never to
        // the number the customer typed and never to the chat that asked.
        // Sending it anywhere the caller controls would prove nothing at all.
        phoneNumber: params.pendingBooking.phoneNumber,
        code,
      });
      return challenge;
    } catch (caughtError) {
      await this.challengeRepository.consumeChallenge(challenge.id, params.now);
      this.logger.warn(
        buildSafeErrorLog('cs_otp_delivery_failed', {
          conversationId: params.conversationId,
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return null;
    }
  }

  /** The live challenge for a conversation, or null. */
  async findLiveChallenge(
    conversationId: string,
    now: Date,
  ): Promise<ChannelOtpChallengeRecord | null> {
    return this.challengeRepository.findLiveChallenge(conversationId, now);
  }

  /**
   * Whether a shared contact card satisfies a `CONTACT_SHARE` challenge.
   *
   * Both conditions are load-bearing. `isSelfShared` rejects a card forwarded
   * from the sender's address book — anyone can send anyone's contact, and a
   * card that is not the sender's own is exactly as much evidence as typing
   * the number was. The number comparison then rejects a customer who shares
   * their own, real, but *different* number: that proves they hold a phone,
   * not that they hold the one on the clinic's record.
   */
  isContactSatisfying(
    challenge: ChannelOtpChallengeRecord,
    sharedContact: SharedContact,
  ): boolean {
    if (!sharedContact.isSelfShared) {
      return false;
    }
    return (
      normalizePhoneNumber(sharedContact.phoneNumber) ===
      normalizePhoneNumber(challenge.pendingBooking.phoneNumber)
    );
  }

  /**
   * Checks one submitted code and spends an attempt.
   *
   * A wrong code returns how many attempts remain so the caller can decide
   * between "try again" and "we are done here"; the caller, not this method,
   * consumes the challenge on exhaustion, because exhaustion also has to
   * complete the pending booking as a draft.
   */
  async submitCode(params: {
    challenge: ChannelOtpChallengeRecord;
    code: string;
    now: Date;
  }): Promise<{ isVerified: boolean; attemptsRemaining: number }> {
    const isVerified = await this.challengeRepository.isCodeMatching(
      params.challenge.id,
      params.code,
      params.now,
    );
    if (isVerified) {
      return { isVerified: true, attemptsRemaining: 0 };
    }
    const attemptsUsed = await this.challengeRepository.recordFailedAttempt(params.challenge.id);
    return {
      isVerified: false,
      attemptsRemaining: Math.max(0, this.serviceConfig.booking.otpMaxAttempts - attemptsUsed),
    };
  }

  async consumeChallenge(challengeId: string, now: Date): Promise<void> {
    await this.challengeRepository.consumeChallenge(challengeId, now);
  }

  /**
   * Whether a link's proof is still current (§5.1.1, `CS_LINK_REVERIFY_DAYS`).
   *
   * A verification is evidence about a moment, not a permanent fact: numbers
   * are reassigned, phones are sold, and a patient's registered number
   * changes. A link older than the window is re-challenged rather than
   * trusted.
   */
  isVerificationFresh(verifiedAt: string | null, now: Date): boolean {
    if (verifiedAt === null) {
      return false;
    }
    const verifiedAtMs = Date.parse(verifiedAt);
    if (Number.isNaN(verifiedAtMs)) {
      return false;
    }
    return now.getTime() - verifiedAtMs < this.serviceConfig.booking.linkReverifyDays * DAY_IN_MS;
  }

  private requireOtpDelivery(): OtpDeliveryService {
    if (this.otpDelivery === null) {
      throw new Error('No OTP delivery transport is bound on this deployment');
    }
    return this.otpDelivery;
  }
}
