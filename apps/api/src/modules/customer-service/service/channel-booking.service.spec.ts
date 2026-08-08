import { ConfigService } from '@nestjs/config';

import { DoctorSessionCalendarItem, PatientPhoneMatch } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AppointmentManagementService } from '../../appointment-management/service/appointment-management.service';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { ChannelPatientLinkRepository } from '../repository/channel-patient-link.repository';
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
  let mockPatientService: jest.Mocked<
    Pick<PatientManagementService, 'findChannelPhoneMatches' | 'createChannelDraftPatient'>
  >;
  let mockLinkRepository: jest.Mocked<
    Pick<ChannelPatientLinkRepository, 'recordClaim' | 'markVerified'>
  >;
  let mockVerificationService: jest.Mocked<
    Pick<
      ChannelVerificationService,
      'resolveAvailableMethod' | 'issueChallenge' | 'isVerificationFresh'
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

  function buildService(): ChannelBookingService {
    return new ChannelBookingService(
      new ConfigService({}),
      mockAppointmentService as unknown as AppointmentManagementService,
      mockPatientService as unknown as PatientManagementService,
      mockLinkRepository as unknown as ChannelPatientLinkRepository,
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
      createChannelDraftPatient: jest
        .fn()
        .mockResolvedValue({ id: 'draft-1', mrn: '00000009', fullName: 'Siti Aminah' }),
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
    };
    bookingService = buildService();
  });

  it('books against a fresh draft when the number matches nothing', async () => {
    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    expect(mockPatientService.createChannelDraftPatient).toHaveBeenCalledWith(
      // Stored normalised, so the customer's *next* booking finds this draft
      // instead of creating a second one.
      { fullName: 'Siti Aminah', phoneNumber: '628123456789' },
      inputActor,
    );
    expect(outcome.result.outcome).toBe('CONFIRMED');
  });

  it('reuses a draft this chat already created for the same number', async () => {
    mockPatientService.findChannelPhoneMatches.mockResolvedValue([
      { id: 'draft-1', fullName: 'Siti Aminah', source: 'CHANNEL_BOOKING' },
    ] satisfies PatientPhoneMatch[]);

    await bookingService.bookFromChannel(buildBookingParams());

    expect(mockPatientService.createChannelDraftPatient).not.toHaveBeenCalled();
    expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'draft-1' }),
      inputActor,
    );
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

  it('reveals nothing about the match when no challenge can be issued', async () => {
    mockPatientService.findChannelPhoneMatches.mockResolvedValue([
      { id: 'patient-1', fullName: 'Siti Aminah', source: 'FRONT_DESK' },
    ] satisfies PatientPhoneMatch[]);
    mockVerificationService.resolveAvailableMethod.mockResolvedValue(null);

    const outcome = await bookingService.bookFromChannel(buildBookingParams());

    // §5.1.1's no-registry-oracle rule: the existing record is untouched, a
    // draft is created instead, and the reply is the ordinary confirmation.
    expect(mockAppointmentService.bookSessionForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'draft-1' }),
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
    expect(mockPatientService.createChannelDraftPatient).not.toHaveBeenCalled();
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
