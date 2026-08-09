import { ConfigService } from '@nestjs/config';

import { ChannelOtpChallengeRecord } from '@hms/shared-types';

import { ChannelOtpChallengeRepository } from '../repository/channel-otp-challenge.repository';
import { ChannelVerificationService } from './channel-verification.service';
import { OtpDeliveryService } from './otp-delivery.service';

describe('ChannelVerificationService', () => {

  describe('channel possession (§5.1.1 tier 1)', () => {
    it.each([
      ['the same digits', '628123456789@s.whatsapp.net', '628123456789'],
      ['a national-format claim', '628123456789@s.whatsapp.net', '081234 56789'],
      ['a linked-device JID', '628123456789:12@s.whatsapp.net', '+62 812-3456-789'],
    ])('accepts %s', (_label, externalChatId, claimedPhoneNumber) => {
      const service = buildService();

      // `0812…` and `+62812…` are the same number written two ways, and a
      // customer typing their own number in the other format must not be
      // challenged for it.
      expect(
        service.isChannelPossessionProven({
          channel: 'WHATSAPP',
          externalChatId,
          claimedPhoneNumber,
        }),
      ).toBe(true);
    });

    it('refuses when the claimed number is not the sender', () => {
      const service = buildService();

      expect(
        service.isChannelPossessionProven({
          channel: 'WHATSAPP',
          externalChatId: '628123456789@s.whatsapp.net',
          claimedPhoneNumber: '628999888777',
        }),
      ).toBe(false);
    });

    it('refuses on Telegram, where a chat id is not a phone number', () => {
      const service = buildService();

      expect(
        service.isChannelPossessionProven({
          channel: 'TELEGRAM',
          externalChatId: '628123456789',
          claimedPhoneNumber: '628123456789',
        }),
      ).toBe(false);
    });

    it('refuses an empty sender', () => {
      const service = buildService();

      expect(
        service.isChannelPossessionProven({
          channel: 'WHATSAPP',
          externalChatId: '@s.whatsapp.net',
          claimedPhoneNumber: '628123456789',
        }),
      ).toBe(false);
    });
  });

  const inputNow = new Date('2026-08-08T09:00:00.000Z');

  let mockChallengeRepository: jest.Mocked<
    Pick<
      ChannelOtpChallengeRepository,
      | 'createChallenge'
      | 'findLiveChallenge'
      | 'isCodeMatching'
      | 'recordFailedAttempt'
      | 'consumeChallenge'
      | 'countChallengesSince'
    >
  >;

  function buildChallenge(
    overrides: Partial<ChannelOtpChallengeRecord> = {},
  ): ChannelOtpChallengeRecord {
    return {
      id: 'challenge-1',
      conversationId: 'conversation-1',
      method: 'CONTACT_SHARE',
      patientId: 'patient-1',
      attemptsUsed: 0,
      expiresAt: '2026-08-08T09:05:00.000Z',
      pendingBooking: {
        patientFullName: 'Siti',
        phoneNumber: '628123456789',
        doctorId: 'doctor-1',
        scheduleId: 'schedule-1',
        sessionDate: '2026-08-20',
        note: null,
      },
      ...overrides,
    };
  }

  function buildService(otpDelivery: OtpDeliveryService | null = null): ChannelVerificationService {
    return new ChannelVerificationService(
      new ConfigService({}),
      mockChallengeRepository as unknown as ChannelOtpChallengeRepository,
      otpDelivery,
    );
  }

  beforeEach(() => {
    mockChallengeRepository = {
      createChallenge: jest.fn().mockResolvedValue(buildChallenge()),
      findLiveChallenge: jest.fn().mockResolvedValue(null),
      isCodeMatching: jest.fn().mockResolvedValue(false),
      recordFailedAttempt: jest.fn().mockResolvedValue(1),
      consumeChallenge: jest.fn().mockResolvedValue(undefined),
      countChallengesSince: jest.fn().mockResolvedValue(0),
    };
  });

  describe('choosing a tier', () => {
    it('offers the contact-share tier on Telegram, which needs no transport', async () => {
      await expect(
        buildService().resolveAvailableMethod({
          conversationId: 'conversation-1',
          channel: 'TELEGRAM',
          now: inputNow,
        }),
      ).resolves.toBe('CONTACT_SHARE');
    });

    it('offers nothing on WhatsApp until a delivery transport is bound', async () => {
      // `PCS-T09` binds it. Until then the booking falls through to a draft,
      // which is a specified outcome rather than a failure.
      await expect(
        buildService().resolveAvailableMethod({
          conversationId: 'conversation-1',
          channel: 'WHATSAPP',
          now: inputNow,
        }),
      ).resolves.toBeNull();
    });

    it('offers the code tier on WhatsApp once a transport exists', async () => {
      const mockDelivery = { sendVerificationCode: jest.fn() } as unknown as OtpDeliveryService;

      await expect(
        buildService(mockDelivery).resolveAvailableMethod({
          conversationId: 'conversation-1',
          channel: 'WHATSAPP',
          now: inputNow,
        }),
      ).resolves.toBe('OTP');
    });

    it('offers nothing once the daily challenge quota is spent', async () => {
      mockChallengeRepository.countChallengesSince.mockResolvedValue(3);

      // §8.3: repeated challenges against one chat are what enumeration looks
      // like, so the answer is to stop challenging, not to stop booking.
      await expect(
        buildService().resolveAvailableMethod({
          conversationId: 'conversation-1',
          channel: 'TELEGRAM',
          now: inputNow,
        }),
      ).resolves.toBeNull();
    });
  });

  describe('issuing a challenge', () => {
    it('stores no code for a contact-share challenge', async () => {
      await buildService().issueChallenge({
        conversationId: 'conversation-1',
        method: 'CONTACT_SHARE',
        patientId: 'patient-1',
        pendingBooking: buildChallenge().pendingBooking,
        now: inputNow,
      });

      expect(mockChallengeRepository.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ code: null }),
      );
    });

    it('sends the code to the registered number, never to the chat', async () => {
      const mockDelivery = {
        sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      } as unknown as OtpDeliveryService;

      await buildService(mockDelivery).issueChallenge({
        conversationId: 'conversation-1',
        method: 'OTP',
        patientId: 'patient-1',
        pendingBooking: buildChallenge().pendingBooking,
        now: inputNow,
      });

      const [call] = (mockDelivery.sendVerificationCode as jest.Mock).mock.calls;
      expect(call?.[0]?.phoneNumber).toBe('628123456789');
      expect(call?.[0]?.code).toMatch(/^\d{6}$/);
    });

    it('consumes the challenge and falls through when delivery fails', async () => {
      const mockDelivery = {
        sendVerificationCode: jest.fn().mockRejectedValue(new Error('gateway down')),
      } as unknown as OtpDeliveryService;

      const challenge = await buildService(mockDelivery).issueChallenge({
        conversationId: 'conversation-1',
        method: 'OTP',
        patientId: 'patient-1',
        pendingBooking: buildChallenge().pendingBooking,
        now: inputNow,
      });

      // Leaving a live challenge nobody can satisfy would strand the customer
      // for five minutes waiting on a code that was never sent.
      expect(challenge).toBeNull();
      expect(mockChallengeRepository.consumeChallenge).toHaveBeenCalledWith('challenge-1', inputNow);
    });
  });

  describe('resolving a contact card', () => {
    it('accepts the sender own verified number', () => {
      expect(
        buildService().isContactSatisfying(buildChallenge(), {
          phoneNumber: '+62 812-3456-789',
          isSelfShared: true,
        }),
      ).toBe(true);
    });

    it('refuses a card forwarded from the address book', () => {
      // Anyone can send anyone's contact; only Telegram's own card for the
      // sender is evidence of possession.
      expect(
        buildService().isContactSatisfying(buildChallenge(), {
          phoneNumber: '+62 812-3456-789',
          isSelfShared: false,
        }),
      ).toBe(false);
    });

    it('refuses the sender own but different number', () => {
      expect(
        buildService().isContactSatisfying(buildChallenge(), {
          phoneNumber: '+62 899-0000-000',
          isSelfShared: true,
        }),
      ).toBe(false);
    });
  });

  describe('resolving a code', () => {
    it('spends an attempt on a wrong code and reports what remains', async () => {
      mockChallengeRepository.recordFailedAttempt.mockResolvedValue(2);

      await expect(
        buildService().submitCode({
          challenge: buildChallenge({ method: 'OTP' }),
          code: '111111',
          now: inputNow,
        }),
      ).resolves.toEqual({ isVerified: false, attemptsRemaining: 1 });
    });

    it('spends no attempt on a correct code', async () => {
      mockChallengeRepository.isCodeMatching.mockResolvedValue(true);

      await expect(
        buildService().submitCode({
          challenge: buildChallenge({ method: 'OTP' }),
          code: '123456',
          now: inputNow,
        }),
      ).resolves.toEqual({ isVerified: true, attemptsRemaining: 0 });
      expect(mockChallengeRepository.recordFailedAttempt).not.toHaveBeenCalled();
    });
  });

  describe('verification freshness', () => {
    it('treats a proof inside the re-verification window as current', () => {
      expect(buildService().isVerificationFresh('2026-06-01T00:00:00.000Z', inputNow)).toBe(true);
    });

    it('re-challenges a proof older than the window', () => {
      // Numbers get reassigned and phones get sold; a verification is evidence
      // about a moment, not a permanent fact.
      expect(buildService().isVerificationFresh('2025-01-01T00:00:00.000Z', inputNow)).toBe(false);
    });

    it('treats an unverified link as never fresh', () => {
      expect(buildService().isVerificationFresh(null, inputNow)).toBe(false);
    });
  });
});
