import { ConfigService } from '@nestjs/config';

import { DoctorSessionCalendarItem, PatientPhoneMatch } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { ChannelPatientLinkRepository } from '../repository/channel-patient-link.repository';
import { ProspectivePatientRepository } from '../repository/prospective-patient.repository';
import { ChannelBookingService } from './channel-booking.service';
import { ChannelVerificationService } from './channel-verification.service';
import { encodeChannelSessionReference } from './channel-session-reference';
import { CS_REPLY_TEMPLATES } from './cs-reply-templates';

const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_DATE = '2026-08-20';
const SESSION_TOKEN = encodeChannelSessionReference({
  doctorId: '22222222-2222-4222-8222-222222222222',
  scheduleId: SCHEDULE_ID,
  sessionDate: SESSION_DATE,
});

describe('ChannelBookingService', () => {
  const inputActor: CurrentUser = { sub: 'system-user', email: 'cs@system.hms.local' };

  let mockAppointmentService: jest.Mocked<
    Pick<
      AppointmentManagementService,
      'listSessionsCalendar' | 'bookSessionForChannel' | 'countChannelBookingLimits'
    >
  >;
  let mockPatientService: jest.Mocked<Pick<PatientManagementService, 'findChannelPhoneMatches'>>;
  let mockProspectiveRepository: jest.Mocked<
    Pick<
      ProspectivePatientRepository,
      'createAwaitingArrival' | 'findAwaitingArrivalByPhoneNumber'
    >
  >;
  let mockLinkRepository: jest.Mocked<
    Pick<ChannelPatientLinkRepository, 'recordClaim' | 'markVerified'>
  >;
  let mockVerificationService: jest.Mocked<
    Pick<
      ChannelVerificationService,
      | 'resolveAvailableMethod'
      | 'issueChallenge'
      | 'isVerificationFresh'
      | 'isChannelPossessionProven'
    >
  >;
  let bookingService: ChannelBookingService;

  function buildSession(
    overrides: Partial<DoctorSessionCalendarItem> = {},
  ): DoctorSessionCalendarItem {
    return {
      id: null,
      scheduleId: SCHEDULE_ID,
      doctorId: '22222222-2222-4222-8222-222222222222',
      sessionDate: SESSION_DATE,
      startTime: '08:00',
      endTime: '12:00',
      status: 'OPEN',
      maxPatients: 10,
      bookedCount: 2,
      remaining: 8,
      doctor: { id: '22222222-2222-4222-8222-222222222222', fullName: 'dr. Sinta', specialty: 'Umum' },
      ...overrides,
    } as DoctorSessionCalendarItem;
  }

  function buildBookingParams(overrides: Record<string, unknown> = {}) {
    return {
      conversationId: 'conversation-1',
      channel: 'TELEGRAM' as const,
      externalChatId: '12345',
      actor: inputActor,
      patientFullName: 'Siti Aminah',
      phoneNumber: '0812-3456-789',
      sessionId: SESSION_TOKEN,
      ...overrides,
    };
  }

  /** An open prospective record on this number, as `P17-T03` reuses it. */
  function buildAwaiting(id: string, fullName: string) {
    return {
      id,
      fullName,
      phoneNumber: '628123456789',
      channel: 'TELEGRAM' as const,
      externalChatId: '12345',
      status: 'AWAITING_ARRIVAL' as const,
      patientId: null,
      convertedAt: null,
      convertedById: null,
      expiresAt: '2026-11-29T00:00:00.000Z',
      createdAt: '2026-08-31T00:00:00.000Z',
    };
  }

  function buildService(): ChannelBookingService {
    return new ChannelBookingService(
      new ConfigService({}),
      mockAppointmentService as unknown as AppointmentManagementService,
      mockPatientService as unknown as PatientManagementService,
      mockLinkRepository as unknown as ChannelPatientLinkRepository,
      mockProspectiveRepository as unknown as ProspectivePatientRepository,
      mockVerificationService as unknown as ChannelVerificationService,
    );
  }

  beforeEach(() => {
    mockAppointmentService = {
      listSessionsCalendar: jest.fn().mockResolvedValue([buildSession()]),
      bookSessionForChannel: jest
        .fn()
        .mockResolvedValue({ outcome: 'BOOKED', appointment: { id: 'appointment-1' } }),
      countChannelBookingLimits: jest
        .fn()
        .mockResolvedValue({ activeFutureBookings: 0, draftBookingsToday: 0 }),
    };
    mockPatientService = {
      findChannelPhoneMatches: jest.fn().mockResolvedValue([]),
    };
    mockProspectiveRepository = {
      findAwaitingArrivalByPhoneNumber: jest.fn().mockResolvedValue([]),
      createAwaitingArrival: jest.fn().mockResolvedValue({
        id: 'prospective-1',
        fullName: 'Siti Aminah',
        phoneNumber: '628123456789',
        channel: 'TELEGRAM',
        externalChatId: '12345',
        status: 'AWAITING_ARRIVAL',
        patientId: null,
        convertedAt: null,
        convertedById: null,
        expiresAt: '2026-11-29T00:00:00.000Z',
        createdAt: '2026-08-31T00:00:00.000Z',
      }),
    };
    mockLinkRepository = {
      recordClaim: jest.fn().mockResolvedValue({
        id: 'link-1',
        channel: 'TELEGRAM',
        externalChatId: '12345',
        phoneNumber: '628123456789',
        fullName: 'Siti Aminah',
        patientId: null,
        verificationStatus: 'UNVERIFIED',
        verifiedAt: null,
      }),
      markVerified: jest.fn().mockResolvedValue(undefined),
    };
    mockVerificationService = {
      resolveAvailableMethod: jest.fn().mockResolvedValue('CONTACT_SHARE'),
      issueChallenge: jest.fn().mockResolvedValue({ id: 'challenge-1' }),
      isVerificationFresh: jest.fn().mockReturnValue(false),
      isChannelPossessionProven: jest.fn().mockReturnValue(false),
    };
    bookingService = buildService();
  });

  it('opens a prospective record when the number matches nothing, and spends no MRN', async () => {
    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    expect(mockProspectiveRepository.createAwaitingArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Siti Aminah',
        // Stored normalised, so the customer's *next* booking finds this record
        // instead of opening a second one.
        phoneNumber: '628123456789',
        channel: 'TELEGRAM',
        externalChatId: '12345',
      }),
    );
    // The whole point of P17-T03: no PatientProfile, so no MRN.
    expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ prospectivePatientId: 'prospective-1' }),
      inputActor,
    );
    expect(mockAppointmentService.bookSessionForChannel.mock.calls[0]?.[0]).not.toHaveProperty(
      'patientId',
    );
    expect(outcome.result.outcome).toBe('CONFIRMED');
  });

  it('gives the record an expiry from the configured retention window', async () => {
    await bookingService.bookFromChannel(buildBookingParams());

    const [payload] = mockProspectiveRepository.createAwaitingArrival.mock.calls[0] as [
      { expiresAt: Date },
    ];
    const daysAhead = Math.round(
      (payload.expiresAt.getTime() - Date.now()) / 86_400_000,
    );
    // 90 days by default, and not the 25-year RME floor — no MRN was spent and
    // no clinical record exists, so UU PDP 27/2022 governs, not PMK 24/2022.
    expect(daysAhead).toBe(90);
  });

  it('reuses a prospective record this number already opened', async () => {
    mockProspectiveRepository.findAwaitingArrivalByPhoneNumber.mockResolvedValue([
      buildAwaiting('prospective-existing', 'Siti Aminah'),
    ]);

    await bookingService.bookFromChannel(buildBookingParams());

    expect(mockProspectiveRepository.createAwaitingArrival).not.toHaveBeenCalled();
    expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ prospectivePatientId: 'prospective-existing' }),
      inputActor,
    );
  });

  /**
   * One number is one household. A parent books for a child from their own
   * phone, and before the name was part of the match the child's appointment
   * was filed under the parent — with any clinical note taken at arrival
   * following it onto the wrong record.
   */
  describe('satu nomor, beberapa pasien', () => {
    it('opens a separate record when the same number books for somebody else', async () => {
      mockProspectiveRepository.findAwaitingArrivalByPhoneNumber.mockResolvedValue([
        buildAwaiting('prospective-parent', 'Rizky Pratama'),
      ]);

      await bookingService.bookFromChannel(
        buildBookingParams({ patientFullName: 'Alya Pratama' }),
      );

      expect(mockProspectiveRepository.createAwaitingArrival).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Alya Pratama', phoneNumber: '628123456789' }),
      );
      expect(mockAppointmentService.bookSessionForChannel).not.toHaveBeenCalledWith(
        expect.objectContaining({ prospectivePatientId: 'prospective-parent' }),
        inputActor,
      );
    });

    it('still reuses the record when the same person books again, spelled loosely', async () => {
      mockProspectiveRepository.findAwaitingArrivalByPhoneNumber.mockResolvedValue([
        buildAwaiting('prospective-parent', 'Rizky Pratama'),
      ]);

      await bookingService.bookFromChannel(
        buildBookingParams({ patientFullName: '  rizky   pratama ' }),
      );

      expect(mockProspectiveRepository.createAwaitingArrival).not.toHaveBeenCalled();
      expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
        expect.objectContaining({ prospectivePatientId: 'prospective-parent' }),
        inputActor,
      );
    });

    it('does not book onto a front-desk record belonging to a different name', async () => {
      mockPatientService.findChannelPhoneMatches.mockResolvedValue([
        { id: 'patient-parent', fullName: 'Rizky Pratama', source: 'FRONT_DESK' },
      ] satisfies PatientPhoneMatch[]);

      const outcome = await bookingService.bookFromChannel(
        buildBookingParams({ patientFullName: 'Alya Pratama' }),
      );

      // No challenge either: there is nothing about the child to prove against
      // the parent's record, so this is an ordinary first booking.
      expect(outcome.result.outcome).toBe('CONFIRMED');
      expect(mockProspectiveRepository.createAwaitingArrival).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Alya Pratama', phoneNumber: '628123456789' }),
      );
    });

    it('does not reuse a proven link for a different person on the same number', async () => {
      mockLinkRepository.recordClaim.mockResolvedValue({
        id: 'link-1',
        channel: 'TELEGRAM',
        externalChatId: '12345',
        phoneNumber: '628123456789',
        // Already overwritten by this booking's claim, which is exactly why the
        // link's own name cannot be the thing compared.
        fullName: 'Alya Pratama',
        patientId: 'patient-parent',
        verificationStatus: 'CHANNEL_VERIFIED',
        verifiedAt: new Date().toISOString(),
      });
      mockVerificationService.isVerificationFresh.mockReturnValue(true);
      mockPatientService.findChannelPhoneMatches.mockResolvedValue([
        { id: 'patient-parent', fullName: 'Rizky Pratama', source: 'FRONT_DESK' },
      ] satisfies PatientPhoneMatch[]);

      await bookingService.bookFromChannel(
        buildBookingParams({ patientFullName: 'Alya Pratama' }),
      );

      expect(mockAppointmentService.bookSessionForChannel).not.toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'patient-parent' }),
        inputActor,
      );
      expect(mockProspectiveRepository.createAwaitingArrival).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Alya Pratama', phoneNumber: '628123456789' }),
      );
    });
  });

  it('challenges rather than links when the number matches a front-desk record', async () => {
    mockPatientService.findChannelPhoneMatches.mockResolvedValue([
      { id: 'patient-1', fullName: 'Siti Aminah', source: 'FRONT_DESK' },
    ] satisfies PatientPhoneMatch[]);

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    // A phone match is a claim, not proof (D-CS-08): nothing is booked and
    // nothing is linked until possession is shown.
    expect(outcome.result).toEqual({ outcome: 'VERIFICATION_REQUIRED' });
    expect(outcome.deterministicReply).toBe(CS_REPLY_TEMPLATES.contactShareChallenge);
    expect(outcome.pausesConversation).toBe(true);
    expect(mockAppointmentService.bookSessionForChannel).not.toHaveBeenCalled();
  });

  it('links without a challenge when the WhatsApp sender owns the number (§5.1.1 tier 1)', async () => {
    mockPatientService.findChannelPhoneMatches.mockResolvedValue([
      { id: 'patient-1', fullName: 'Siti Aminah', source: 'FRONT_DESK' },
    ] satisfies PatientPhoneMatch[]);
    mockVerificationService.isChannelPossessionProven.mockReturnValue(true);

    const outcome = await bookingService.bookFromChannel(
      buildBookingParams({ channel: 'WHATSAPP', externalChatId: '628123456789@s.whatsapp.net' }),
    );

    // WhatsApp already verified this device owns the number, so challenging
    // would send a code to the very chat that asked for it.
    expect(mockVerificationService.issueChallenge).not.toHaveBeenCalled();
    expect(mockLinkRepository.markVerified).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'patient-1',
        verificationStatus: 'CHANNEL_VERIFIED',
      }),
    );
    expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'patient-1' }),
      inputActor,
    );
    expect(outcome.result.outcome).toBe('CONFIRMED');
  });

  it('still challenges a WhatsApp customer booking for somebody else', async () => {
    mockPatientService.findChannelPhoneMatches.mockResolvedValue([
      { id: 'patient-1', fullName: 'Siti Aminah', source: 'FRONT_DESK' },
    ] satisfies PatientPhoneMatch[]);
    // The number typed is not the number they are messaging from — a parent
    // booking for a child, or an attacker with somebody's number.
    mockVerificationService.isChannelPossessionProven.mockReturnValue(false);

    const outcome = await bookingService.bookFromChannel(
      buildBookingParams({ channel: 'WHATSAPP', externalChatId: '628999888777@s.whatsapp.net' }),
    );

    expect(outcome.result).toEqual({ outcome: 'VERIFICATION_REQUIRED' });
    expect(mockLinkRepository.markVerified).not.toHaveBeenCalled();
  });

  it('reveals nothing about the match when no challenge can be issued', async () => {
    mockPatientService.findChannelPhoneMatches.mockResolvedValue([
      { id: 'patient-1', fullName: 'Siti Aminah', source: 'FRONT_DESK' },
    ] satisfies PatientPhoneMatch[]);
    mockVerificationService.resolveAvailableMethod.mockResolvedValue(null);

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    // §5.1.1's no-registry-oracle rule: the existing record is untouched, a
    // prospective record is opened instead, and the reply is the ordinary
    // confirmation.
    expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ prospectivePatientId: 'prospective-1' }),
      inputActor,
    );
    expect(outcome.result.outcome).toBe('CONFIRMED');
  });

  it('produces the identical confirmation whether the booking linked or drafted', async () => {
    const draftOutcome = await bookingService.bookFromChannel(buildBookingParams());

    mockLinkRepository.recordClaim.mockResolvedValue({
      id: 'link-1',
      channel: 'TELEGRAM',
      externalChatId: '12345',
      phoneNumber: '628123456789',
      fullName: 'Siti Aminah',
      patientId: 'patient-1',
      verificationStatus: 'OTP_VERIFIED',
      verifiedAt: '2026-08-01T00:00:00.000Z',
    });
    mockVerificationService.isVerificationFresh.mockReturnValue(true);
    const linkedOutcome = await bookingService.bookFromChannel(buildBookingParams());

    // Byte-identical but for the reference code, which is random per booking:
    // there is no phrasing difference to read a registry out of.
    expect(stripReferenceCode(linkedOutcome.deterministicReply ?? '')).toBe(
      stripReferenceCode(draftOutcome.deterministicReply ?? ''),
    );
  });

  it('never promises a queue position', async () => {
    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    expect(outcome.deterministicReply).toContain('Nomor antrean diberikan saat check-in');
    expect(outcome.deterministicReply).not.toMatch(/nomor antrean Anda/i);
  });

  it('refuses a session token it did not mint', async () => {
    const outcome = await bookingService.bookFromChannel(
      buildBookingParams({ sessionId: 'schedule-1@besok' }),
    );

    expect(outcome.result).toEqual({ outcome: 'REJECTED', reason: 'SESSION_NOT_FOUND' });
    expect(mockAppointmentService.listSessionsCalendar).not.toHaveBeenCalled();
  });

  it('refuses a full session before touching the patient registry', async () => {
    mockAppointmentService.listSessionsCalendar.mockResolvedValue([
      buildSession({ remaining: 0, bookedCount: 10 }),
    ]);

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    expect(outcome.result).toEqual({ outcome: 'REJECTED', reason: 'SESSION_FULL' });
    expect(mockPatientService.findChannelPhoneMatches).not.toHaveBeenCalled();
  });

  it('applies the per-number cap before creating a draft patient', async () => {
    mockAppointmentService.countChannelBookingLimits.mockResolvedValue({
      activeFutureBookings: 3,
      draftBookingsToday: 0,
    });

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    // A capped booking must leave no draft behind, or the cap becomes a way to
    // fill the patient table.
    expect(outcome.result).toEqual({ outcome: 'REJECTED', reason: 'TOO_MANY_ACTIVE_BOOKINGS' });
    expect(mockProspectiveRepository.createAwaitingArrival).not.toHaveBeenCalled();
  });

  it('applies the clinic-wide daily cap on unknown-number bookings', async () => {
    mockAppointmentService.countChannelBookingLimits.mockResolvedValue({
      activeFutureBookings: 0,
      draftBookingsToday: 50,
    });

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    expect(outcome.result).toEqual({ outcome: 'REJECTED', reason: 'DAILY_BOOKING_LIMIT_REACHED' });
  });

  it('turns a booking-time conflict into a reason the model can phrase', async () => {
    mockAppointmentService.bookSessionForChannel.mockResolvedValue({ outcome: 'CUTOFF_PASSED' });

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    expect(outcome.result).toEqual({ outcome: 'REJECTED', reason: 'BOOKING_CUTOFF_PASSED' });
  });

  it('marks the link verified when a challenge is proven', async () => {
    await bookingService.recordVerification({
      channel: 'TELEGRAM',
      externalChatId: '12345',
      phoneNumber: '628123456789',
      fullName: 'Siti Aminah',
      patientId: 'patient-1',
      now: new Date('2026-08-08T00:00:00.000Z'),
    });

    expect(mockLinkRepository.markVerified).toHaveBeenCalledWith({
      linkId: 'link-1',
      patientId: 'patient-1',
      verificationStatus: 'OTP_VERIFIED',
      verifiedAt: new Date('2026-08-08T00:00:00.000Z'),
    });
  });
});

/** The reference code is random per booking; everything else must match. */
function stripReferenceCode(reply: string): string {
  return reply.replace(/Kode booking: .+/u, 'Kode booking: <code>');
}
