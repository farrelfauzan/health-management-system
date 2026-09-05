import { NotFoundException } from '@nestjs/common';

import { PatientDeliveryConsentRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { DeliveryGateRepository } from '../repository/delivery-gate.repository';
import { PatientDeliveryConsentRepository } from '../repository/patient-delivery-consent.repository';
import { DeliveryChannelGateService } from './delivery-channel-gate.service';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';

const PATIENT_ID = '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c';
const ACTOR = { sub: '0f4b6f2a-5d7e-4c1b-9a3e-2b8c7d6e5f40', email: 'kasir@klinik.example' };
const NOTICE = { id: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9', version: '1.0' };
const PATIENT_CONTACT = { id: PATIENT_ID, phoneNumber: '081210000001', email: null };

function buildConsent(
  overrides: Partial<PatientDeliveryConsentRecord> = {},
): PatientDeliveryConsentRecord {
  return {
    id: 'consent-1',
    patientId: PATIENT_ID,
    channel: 'WHATSAPP',
    isGranted: true,
    noticeVersion: NOTICE,
    grantedAt: new Date('2026-09-28T02:15:00.000Z'),
    grantedBy: { id: ACTOR.sub, email: ACTOR.email },
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

describe('PatientDeliveryConsentService', () => {
  let mockConsentRepository: jest.Mocked<
    Pick<PatientDeliveryConsentRepository, 'findByPatient' | 'findOne' | 'grant' | 'revoke'>
  >;
  let mockGateRepository: jest.Mocked<Pick<DeliveryGateRepository, 'findPatientContact'>>;
  let mockGateService: jest.Mocked<
    Pick<DeliveryChannelGateService, 'resolveWhatsappGate' | 'resolveEmailGate'>
  >;
  let mockPrivacyNoticeRepository: jest.Mocked<Pick<PrivacyNoticeRepository, 'findCurrentVersion'>>;
  let mockPatientService: jest.Mocked<Pick<PatientManagementService, 'getPatientById'>>;
  let mockAuditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let service: PatientDeliveryConsentService;

  beforeEach(() => {
    mockConsentRepository = {
      findByPatient: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      grant: jest.fn().mockResolvedValue(buildConsent()),
      revoke: jest.fn().mockResolvedValue(buildConsent({ isGranted: false })),
    };
    mockGateRepository = { findPatientContact: jest.fn().mockResolvedValue(PATIENT_CONTACT) };
    mockGateService = {
      resolveWhatsappGate: jest
        .fn()
        .mockResolvedValue({ isAllowed: true, refusalReason: null, link: null }),
      resolveEmailGate: jest.fn().mockReturnValue('EMAIL_MISSING'),
    };
    mockPrivacyNoticeRepository = { findCurrentVersion: jest.fn().mockResolvedValue(NOTICE) };
    mockPatientService = { getPatientById: jest.fn().mockResolvedValue({ id: PATIENT_ID }) };
    mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PatientDeliveryConsentService(
      mockConsentRepository as unknown as PatientDeliveryConsentRepository,
      mockGateRepository as unknown as DeliveryGateRepository,
      mockGateService as unknown as DeliveryChannelGateService,
      mockPrivacyNoticeRepository as unknown as PrivacyNoticeRepository,
      mockPatientService as unknown as PatientManagementService,
      mockAuditService as unknown as AuditService,
    );
  });

  describe('upsertConsent', () => {
    it('captures consent against the notice in force and audits the grant', async () => {
      await service.upsertConsent(PATIENT_ID, { channel: 'WHATSAPP', isGranted: true }, ACTOR);

      expect(mockConsentRepository.grant).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        channel: 'WHATSAPP',
        noticeVersionId: NOTICE.id,
        grantedById: ACTOR.sub,
        grantedAt: expect.any(Date),
      });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELIVERY_CONSENT_GRANTED',
          actorUserId: ACTOR.sub,
          patientId: PATIENT_ID,
          metadata: { channel: 'WHATSAPP', noticeVersionId: NOTICE.id },
        }),
      );
    });

    it('withdraws with the STAFF reason and audits the withdrawal', async () => {
      await service.upsertConsent(PATIENT_ID, { channel: 'EMAIL', isGranted: false }, ACTOR);

      expect(mockConsentRepository.revoke).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        channel: 'EMAIL',
        revokedReason: 'STAFF',
        revokedAt: expect.any(Date),
      });
      expect(mockConsentRepository.grant).not.toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELIVERY_CONSENT_WITHDRAWN',
          metadata: { channel: 'EMAIL', revokedReason: 'STAFF' },
        }),
      );
    });

    it('scopes through the patient read before writing anything', async () => {
      mockPatientService.getPatientById.mockRejectedValue(
        new NotFoundException('Patient not found'),
      );

      await expect(
        service.upsertConsent(PATIENT_ID, { channel: 'WHATSAPP', isGranted: true }, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockConsentRepository.grant).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('listConsents', () => {
    it('returns one entry per channel with the consent and the gate reason combined', async () => {
      mockConsentRepository.findByPatient.mockResolvedValue([buildConsent()]);
      mockGateService.resolveWhatsappGate.mockResolvedValue({
        isAllowed: false,
        refusalReason: 'NUMBER_UNVERIFIED',
        link: null,
      });

      const actual = await service.listConsents(PATIENT_ID, ACTOR);

      expect(actual.patientId).toBe(PATIENT_ID);
      expect(actual.channels).toEqual([
        expect.objectContaining({
          channel: 'WHATSAPP',
          isDeliveryAllowed: false,
          refusalReason: 'NUMBER_UNVERIFIED',
          consent: expect.objectContaining({ isGranted: true, noticeVersion: NOTICE }),
        }),
        expect.objectContaining({
          channel: 'EMAIL',
          consent: null,
          isDeliveryAllowed: false,
          refusalReason: 'CONSENT_MISSING',
        }),
      ]);
    });

    it('reports a withdrawn consent before looking at the channel', async () => {
      mockConsentRepository.findByPatient.mockResolvedValue([
        buildConsent({ isGranted: false, revokedReason: 'PATIENT_KEYWORD' }),
      ]);

      const actual = await service.listConsents(PATIENT_ID, ACTOR);

      expect(actual.channels[0]).toEqual(
        expect.objectContaining({ channel: 'WHATSAPP', refusalReason: 'CONSENT_REVOKED' }),
      );
      expect(mockGateService.resolveWhatsappGate).not.toHaveBeenCalled();
    });
  });

  describe('isDeliveryAllowed', () => {
    it('denies by default when the patient was never asked', async () => {
      const actual = await service.isDeliveryAllowed({
        patientId: PATIENT_ID,
        channel: 'WHATSAPP',
      });

      expect(actual).toEqual({ isAllowed: false, refusalReason: 'CONSENT_MISSING' });
      expect(mockGateService.resolveWhatsappGate).not.toHaveBeenCalled();
    });

    it('denies a revoked consent before the next send', async () => {
      mockConsentRepository.findOne.mockResolvedValue(
        buildConsent({ isGranted: false, revokedReason: 'PATIENT_KEYWORD' }),
      );

      const actual = await service.isDeliveryAllowed({
        patientId: PATIENT_ID,
        channel: 'WHATSAPP',
      });

      expect(actual).toEqual({ isAllowed: false, refusalReason: 'CONSENT_REVOKED' });
    });

    it('allows a consented patient whose number is proven', async () => {
      mockConsentRepository.findOne.mockResolvedValue(buildConsent());

      const actual = await service.isDeliveryAllowed({
        patientId: PATIENT_ID,
        channel: 'WHATSAPP',
      });

      expect(actual).toEqual({ isAllowed: true, refusalReason: null });
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('audits a refusal on a number proven for another patient, and only that one', async () => {
      mockConsentRepository.findOne.mockResolvedValue(buildConsent());
      mockGateService.resolveWhatsappGate.mockResolvedValue({
        isAllowed: false,
        refusalReason: 'NUMBER_VERIFIED_FOR_ANOTHER_PATIENT',
        link: null,
      });

      const actual = await service.isDeliveryAllowed(
        { patientId: PATIENT_ID, channel: 'WHATSAPP' },
        ACTOR.sub,
      );

      expect(actual.isAllowed).toBe(false);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELIVERY_CHANNEL_REFUSED',
          actorUserId: ACTOR.sub,
          patientId: PATIENT_ID,
          metadata: { channel: 'WHATSAPP', refusalReason: 'NUMBER_VERIFIED_FOR_ANOTHER_PATIENT' },
        }),
      );
    });

    it('keeps email offered when only WhatsApp consent was withdrawn', async () => {
      mockConsentRepository.findOne.mockImplementation(async (_patientId, channel) =>
        channel === 'EMAIL'
          ? buildConsent({ channel: 'EMAIL' })
          : buildConsent({ isGranted: false }),
      );
      mockGateRepository.findPatientContact.mockResolvedValue({
        ...PATIENT_CONTACT,
        email: 'rina@example.test',
      });
      mockGateService.resolveEmailGate.mockReturnValue(null);

      const whatsapp = await service.isDeliveryAllowed({
        patientId: PATIENT_ID,
        channel: 'WHATSAPP',
      });
      const email = await service.isDeliveryAllowed({ patientId: PATIENT_ID, channel: 'EMAIL' });

      expect(whatsapp.isAllowed).toBe(false);
      expect(email.isAllowed).toBe(true);
    });

    it('raises not-found for a patient that does not exist', async () => {
      mockGateRepository.findPatientContact.mockResolvedValue(null);

      await expect(
        service.isDeliveryAllowed({ patientId: PATIENT_ID, channel: 'EMAIL' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
