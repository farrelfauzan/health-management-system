import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BookAppointmentResult,
  ChannelKindValue,
  CsBookingRejectionReasonValue,
  CustomerServiceConfig,
  DoctorSessionCalendarItem,
  LINKABLE_VERIFICATION_STATUSES,
  PatientPhoneMatch,
  PendingChannelBooking,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { resolveCustomerServiceConfig } from '../customer-service.config';
import { ChannelPatientLinkRepository } from '../repository/channel-patient-link.repository';
import { ChannelVerificationService } from './channel-verification.service';
import { buildBookingConfirmationReply } from './build-booking-confirmation-reply';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';
import { decodeChannelSessionReference } from './channel-session-reference';
import { generateBookingReferenceCode } from './generate-booking-reference-code';
import { normalizePhoneNumber } from './normalize-phone-number';

const DAY_IN_MS = 86_400_000;

/**
 * What `book_appointment` produced, before the registry projects it.
 * `deterministicReply` carries the sentences this codebase insists on wording
 * itself.
 */
export type ChannelBookingOutcome = {
  result: BookAppointmentResult;
  deterministicReply?: string;
  pausesConversation?: boolean;
  requestContact?: boolean;
};

/**
 * The booking flow (strategy §5, D-CS-03, D-CS-04, D-CS-08).
 *
 * The order of the steps is the design, and each one is a place a shortcut
 * would cost something specific:
 *
 *  1. **Decode the session token, then read the session.** A token this
 *     codebase did not mint is refused rather than guessed at.
 *  2. **Record the claim.** The name and number the customer typed are written
 *     down as a *claim* before anything is decided with them.
 *  3. **Look for a phone match, and reveal nothing about it.** This is the one
 *     registry read the channel makes, and its result never reaches a reply.
 *  4. **Apply §8.3's caps** before creating anything, so a capped booking
 *     leaves no draft patient behind.
 *  5. **Resolve the patient**: an already-proven link, or a possession
 *     challenge, or a draft.
 *  6. **Book**, through `AppointmentManagementService` — the same capacity
 *     lock, cutoff, and window validation every other booking gets.
 *
 * **The confirmation is written here, not by the model.** That is what makes
 * the acceptance criterion true: a booking that attached to a real record, a
 * booking that fell through to a draft after a failed challenge, and a booking
 * for a number nobody recognised all produce the *same* sentence from the
 * *same* function. There is no phrasing difference for an attacker to read a
 * registry out of, and there is no turn in which a model could improvise a
 * queue number the clinic never promised.
 */
@Injectable()
export class ChannelBookingService {
  private readonly logger = new Logger(ChannelBookingService.name);
  private readonly serviceConfig: CustomerServiceConfig;

  constructor(
    configService: ConfigService,
    private readonly appointmentService: AppointmentManagementService,
    private readonly patientService: PatientManagementService,
    private readonly linkRepository: ChannelPatientLinkRepository,
    private readonly verificationService: ChannelVerificationService,
  ) {
    this.serviceConfig = resolveCustomerServiceConfig(configService);
  }

  /**
   * The `book_appointment` tool's whole body.
   */
  async bookFromChannel(params: {
    conversationId: string;
    channel: ChannelKindValue;
    externalChatId: string;
    actor: CurrentUser;
    patientFullName: string;
    phoneNumber: string;
    sessionId: string;
    note?: string;
  }): Promise<ChannelBookingOutcome> {
    const now = new Date();
    const reference = decodeChannelSessionReference(params.sessionId);
    if (reference === null) {
      return this.reject('SESSION_NOT_FOUND');
    }
    const session = await this.findSession(reference, params.actor);
    if (session === null) {
      return this.reject('SESSION_NOT_FOUND');
    }
    if (session.status !== 'OPEN') {
      return this.reject('SESSION_CLOSED');
    }
    if (session.remaining !== null && session.remaining <= 0) {
      return this.reject('SESSION_FULL');
    }

    const normalisedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
    const link = await this.linkRepository.recordClaim({
      channel: params.channel,
      externalChatId: params.externalChatId,
      phoneNumber: normalisedPhoneNumber,
      fullName: params.patientFullName,
    });
    const matches = await this.patientService.findChannelPhoneMatches(
      normalisedPhoneNumber,
      params.actor,
    );

    const capRejection = await this.checkBookingCaps(matches, params.actor, now);
    if (capRejection !== null) {
      return this.reject(capRejection);
    }

    const pendingBooking: PendingChannelBooking = {
      patientFullName: params.patientFullName,
      phoneNumber: normalisedPhoneNumber,
      doctorId: session.doctorId,
      scheduleId: reference.scheduleId,
      sessionDate: reference.sessionDate,
      note: params.note ?? null,
    };

    // An existing proof, still inside its re-verification window, books
    // straight through: the point of persisting a verification is that the
    // same chat is not challenged again next month.
    if (
      link.patientId !== null &&
      LINKABLE_VERIFICATION_STATUSES.some((status) => status === link.verificationStatus) &&
      this.verificationService.isVerificationFresh(link.verifiedAt, now)
    ) {
      return this.completeBooking({
        patientId: link.patientId,
        channel: params.channel,
        actor: params.actor,
        pendingBooking,
      });
    }

    // A registry record is a *claim* to be earned. A draft this chat created
    // earlier is not — it holds nothing but what this chat already said — so
    // it is reused rather than challenged, which is also what stops one
    // customer accumulating a new draft per booking.
    const registryMatch = matches.find((match) => match.source === 'FRONT_DESK');
    if (registryMatch !== undefined) {
      const challengeOutcome = await this.challengeOrFallThrough({
        conversationId: params.conversationId,
        channel: params.channel,
        patientId: registryMatch.id,
        pendingBooking,
        now,
      });
      if (challengeOutcome !== null) {
        return challengeOutcome;
      }
    }

    return this.completeAsDraft({
      channel: params.channel,
      actor: params.actor,
      matches,
      pendingBooking,
    });
  }

  /**
   * Finishes a booking that a possession challenge was holding open.
   *
   * Called from the `AWAITING_OTP` handler for every way a challenge can end —
   * verified, failed, expired, declined — with `patientId` set only in the
   * first case. That single entry point is what keeps the four endings
   * indistinguishable to the customer.
   */
  async completePendingBooking(params: {
    channel: ChannelKindValue;
    actor: CurrentUser;
    pendingBooking: PendingChannelBooking;
    verifiedPatientId: string | null;
  }): Promise<ChannelBookingOutcome> {
    if (params.verifiedPatientId !== null) {
      return this.completeBooking({
        patientId: params.verifiedPatientId,
        channel: params.channel,
        actor: params.actor,
        pendingBooking: params.pendingBooking,
      });
    }
    const matches = await this.patientService.findChannelPhoneMatches(
      params.pendingBooking.phoneNumber,
      params.actor,
    );
    return this.completeAsDraft({
      channel: params.channel,
      actor: params.actor,
      matches,
      pendingBooking: params.pendingBooking,
    });
  }

  /**
   * Attaches a proven verification to the chat's link, so the next booking
   * from this chat is not challenged again.
   */
  async recordVerification(params: {
    channel: ChannelKindValue;
    externalChatId: string;
    phoneNumber: string;
    fullName: string;
    patientId: string;
    now: Date;
  }): Promise<void> {
    const link = await this.linkRepository.recordClaim({
      channel: params.channel,
      externalChatId: params.externalChatId,
      phoneNumber: params.phoneNumber,
      fullName: params.fullName,
    });
    await this.linkRepository.markVerified({
      linkId: link.id,
      patientId: params.patientId,
      verificationStatus: 'OTP_VERIFIED',
      verifiedAt: params.now,
    });
  }

  /**
   * Issues a challenge, or returns null meaning "there is no challenge to
   * issue — carry on as a draft".
   *
   * Null covers the quota being spent, the channel offering no usable tier,
   * and delivery failing. All three are the same thing from the customer's
   * side: their booking completes and the front desk reconciles at arrival.
   */
  private async challengeOrFallThrough(params: {
    conversationId: string;
    channel: ChannelKindValue;
    patientId: string;
    pendingBooking: PendingChannelBooking;
    now: Date;
  }): Promise<ChannelBookingOutcome | null> {
    const method = await this.verificationService.resolveAvailableMethod({
      conversationId: params.conversationId,
      channel: params.channel,
      now: params.now,
    });
    if (method === null) {
      return null;
    }
    const challenge = await this.verificationService.issueChallenge({
      conversationId: params.conversationId,
      method,
      patientId: params.patientId,
      pendingBooking: params.pendingBooking,
      now: params.now,
    });
    if (challenge === null) {
      return null;
    }
    return {
      result: { outcome: 'VERIFICATION_REQUIRED' },
      // Worded here rather than by the model, because §5.1.1 puts the whole
      // verification exchange outside the LLM — and because a model asked to
      // explain why it wants a phone number will explain that it found a
      // record, which is precisely the thing that must not be said.
      deterministicReply:
        method === 'CONTACT_SHARE'
          ? CS_REPLY_TEMPLATES.contactShareChallenge
          : CS_REPLY_TEMPLATES.otpChallenge,
      pausesConversation: true,
      requestContact: method === 'CONTACT_SHARE',
    };
  }

  /**
   * Books against a draft patient — reusing one this chat already created for
   * the same number, or creating one.
   */
  private async completeAsDraft(params: {
    channel: ChannelKindValue;
    actor: CurrentUser;
    matches: readonly PatientPhoneMatch[];
    pendingBooking: PendingChannelBooking;
  }): Promise<ChannelBookingOutcome> {
    const existingDraft = params.matches.find((match) => match.source === 'CHANNEL_BOOKING');
    const patientId =
      existingDraft?.id ??
      (
        await this.patientService.createChannelDraftPatient(
          {
            fullName: params.pendingBooking.patientFullName,
            // Stored normalised so the *next* booking from this number finds
            // this draft instead of making a second one.
            phoneNumber: params.pendingBooking.phoneNumber,
          },
          params.actor,
        )
      ).id;
    return this.completeBooking({
      patientId,
      channel: params.channel,
      actor: params.actor,
      pendingBooking: params.pendingBooking,
    });
  }

  private async completeBooking(params: {
    patientId: string;
    channel: ChannelKindValue;
    actor: CurrentUser;
    pendingBooking: PendingChannelBooking;
  }): Promise<ChannelBookingOutcome> {
    const session = await this.findSession(
      {
        scheduleId: params.pendingBooking.scheduleId,
        sessionDate: params.pendingBooking.sessionDate,
      },
      params.actor,
    );
    if (session === null) {
      return this.reject('SESSION_NOT_FOUND');
    }
    const referenceCode = generateBookingReferenceCode();
    const booking = await this.appointmentService.bookSessionForChannel(
      {
        patientId: params.patientId,
        doctorId: session.doctorId,
        scheduleId: params.pendingBooking.scheduleId,
        sessionDate: params.pendingBooking.sessionDate,
        channel: params.channel,
        bookingReferenceCode: referenceCode,
        ...(params.pendingBooking.note === null ? {} : { note: params.pendingBooking.note }),
      },
      params.actor,
    );
    if (booking.outcome !== 'BOOKED') {
      return this.reject(BOOKING_OUTCOME_REASONS[booking.outcome]);
    }
    const result: BookAppointmentResult = {
      outcome: 'CONFIRMED',
      referenceCode,
      doctorName: session.doctor.fullName,
      specialty: session.doctor.specialty,
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      arrivalInstruction: ARRIVAL_INSTRUCTION,
    };
    return { result, deterministicReply: buildBookingConfirmationReply(result) };
  }

  /**
   * §8.3's two booking caps.
   *
   * The active-bookings cap counts across *every* record the number resolved
   * to, drafts included, because a customer booking under three spellings of
   * their name creates three drafts and a cap that saw one at a time would not
   * be a cap. The daily draft cap is clinic-wide for the mirror-image reason:
   * a per-chat limit costs nothing to evade on a channel where a second chat
   * is free.
   */
  private async checkBookingCaps(
    matches: readonly PatientPhoneMatch[],
    actor: CurrentUser,
    now: Date,
  ): Promise<CsBookingRejectionReasonValue | null> {
    const counts = await this.appointmentService.countChannelBookingLimits(
      {
        patientIds: matches.map((match) => match.id),
        activeFrom: now,
        draftsSince: new Date(now.getTime() - DAY_IN_MS),
      },
      actor,
    );
    if (counts.activeFutureBookings >= this.serviceConfig.booking.maxActiveBookingsPerPhone) {
      return 'TOO_MANY_ACTIVE_BOOKINGS';
    }
    if (counts.draftBookingsToday >= this.serviceConfig.booking.maxDraftBookingsPerDay) {
      // Worth a log line: this one is clinic-wide, so reaching it stops
      // *everybody's* bookings and an operator needs to see it happen rather
      // than infer it from a quiet afternoon.
      this.logger.warn(
        `Daily channel draft-booking cap reached (${counts.draftBookingsToday} today)`,
      );
      return 'DAILY_BOOKING_LIMIT_REACHED';
    }
    return null;
  }

  /**
   * Resolves the session behind a token.
   *
   * Reads the whole clinic calendar for that one date and picks the matching
   * window, rather than fetching the schedule directly: the calendar
   * projection is what already merges materialised sessions with
   * not-yet-materialised windows and computes remaining capacity, and
   * duplicating that arithmetic here is how the channel's idea of "full" would
   * drift from the dashboard's.
   */
  private async findSession(
    reference: { scheduleId: string; sessionDate: string },
    actor: CurrentUser,
  ): Promise<DoctorSessionCalendarItem | null> {
    try {
      const sessions = await this.appointmentService.listSessionsCalendar(
        { from: reference.sessionDate, to: reference.sessionDate },
        actor,
      );
      return sessions.find((session) => session.scheduleId === reference.scheduleId) ?? null;
    } catch (caughtError) {
      this.logger.warn(
        buildSafeErrorLog('cs_session_lookup_failed', {
          reason: caughtError instanceof Error ? caughtError.name : 'unknown',
        }),
      );
      return null;
    }
  }

  private reject(reason: CsBookingRejectionReasonValue): ChannelBookingOutcome {
    return { result: { outcome: 'REJECTED', reason } };
  }
}

/**
 * The one sentence every confirmation carries about arrival. It states the
 * session model plainly — first come, first served, number given at the desk —
 * because the single most damaging thing this channel could do is let a
 * customer believe they have an appointment time.
 */
const ARRIVAL_INSTRUCTION =
  'Kedatangan sesuai urutan. Nomor antrean diberikan saat check-in di klinik, jadi mohon datang di dalam rentang jam sesi.';

const BOOKING_OUTCOME_REASONS = {
  SESSION_NOT_OPEN: 'SESSION_CLOSED',
  SESSION_FULL: 'SESSION_FULL',
  ALREADY_BOOKED: 'ALREADY_BOOKED',
  CUTOFF_PASSED: 'BOOKING_CUTOFF_PASSED',
} as const satisfies Record<string, CsBookingRejectionReasonValue>;
