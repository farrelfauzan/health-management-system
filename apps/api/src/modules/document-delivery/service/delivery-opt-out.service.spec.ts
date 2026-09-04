import { Logger } from '@nestjs/common';

import { InboundChannelMessage } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { DeliveryGateRepository } from '../repository/delivery-gate.repository';
import { PatientDeliveryConsentRepository } from '../repository/patient-delivery-consent.repository';
import { DeliveryOptOutService } from './delivery-opt-out.service';

const CHAT_ID = '6281210000001@s.whatsapp.net';
const PATIENT_ID = '7b3f1c2e-9a4d-4e8f-b2c1-0d5e6f7a8b9c';
const SISTER_PATIENT_ID = '1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';

function buildMessage(overrides: Partial<InboundChannelMessage> = {}): InboundChannelMessage {
  return {
    channel: 'WHATSAPP',
    externalChatId: CHAT_ID,
    externalMessageId: '3EB0C127D7BACC83D6A1',
    senderDisplayName: 'Rina',
    text: 'BERHENTI',
    receivedAt: '2026-09-28T03:12:00.000Z',
    ...overrides,
  };
}

describe('DeliveryOptOutService', () => {
  let mockConsentRepository: jest.Mocked<Pick<PatientDeliveryConsentRepository, 'revoke'>>;
  let mockGateRepository: jest.Mocked<
    Pick<DeliveryGateRepository, 'findVerifiedPatientIdsForChat'>
  >;
  let mockGateway: jest.Mocked<Pick<WhatsappGatewayService, 'sendText'>>;
  let mockAuditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let service: DeliveryOptOutService;

  beforeEach(() => {
    mockConsentRepository = { revoke: jest.fn().mockResolvedValue(undefined) };
    mockGateRepository = {
      findVerifiedPatientIdsForChat: jest.fn().mockResolvedValue([PATIENT_ID]),
    };
    mockGateway = { sendText: jest.fn().mockResolvedValue(undefined) };
    mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service = new DeliveryOptOutService(
      mockConsentRepository as unknown as PatientDeliveryConsentRepository,
      mockGateRepository as unknown as DeliveryGateRepository,
      mockGateway as unknown as WhatsappGatewayService,
      mockAuditService as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores an ordinary message without touching consent or replying', async () => {
    const actual = await service.handleOptOut(buildMessage({ text: 'Klinik buka jam berapa?' }));

    expect(actual).toBe(false);
    expect(mockGateRepository.findVerifiedPatientIdsForChat).not.toHaveBeenCalled();
    expect(mockConsentRepository.revoke).not.toHaveBeenCalled();
    expect(mockGateway.sendText).not.toHaveBeenCalled();
  });

  it('ignores the keyword on Telegram, which carries no deliveries', async () => {
    const actual = await service.handleOptOut(buildMessage({ channel: 'TELEGRAM', text: 'STOP' }));

    expect(actual).toBe(false);
    expect(mockConsentRepository.revoke).not.toHaveBeenCalled();
  });

  it('revokes WhatsApp consent for the proven patient with the patient-keyword reason', async () => {
    const actual = await service.handleOptOut(buildMessage({ text: ' berhenti ' }));

    expect(actual).toBe(true);
    expect(mockConsentRepository.revoke).toHaveBeenCalledTimes(1);
    expect(mockConsentRepository.revoke).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      channel: 'WHATSAPP',
      revokedReason: 'PATIENT_KEYWORD',
      revokedAt: expect.any(Date),
    });
  });

  it('audits the opt-out against the patient with no actor and no chat id', async () => {
    await service.handleOptOut(buildMessage());

    expect(mockAuditService.record).toHaveBeenCalledTimes(1);
    const actualEvent = mockAuditService.record.mock.calls[0]?.[0];
    expect(actualEvent).toEqual({
      action: 'DELIVERY_CONSENT_OPTED_OUT',
      resource: 'PatientDeliveryConsent',
      patientId: PATIENT_ID,
      metadata: { channel: 'WHATSAPP', revokedReason: 'PATIENT_KEYWORD' },
    });
    // A JID is a phone number; the audit table is not the place for one.
    expect(JSON.stringify(actualEvent)).not.toContain('6281210000001');
  });

  it('revokes for every patient the chat is proven for, on a shared family phone', async () => {
    mockGateRepository.findVerifiedPatientIdsForChat.mockResolvedValue([
      PATIENT_ID,
      SISTER_PATIENT_ID,
    ]);

    await service.handleOptOut(buildMessage());

    const revokedPatientIds = mockConsentRepository.revoke.mock.calls.map(
      ([data]) => data.patientId,
    );
    expect(revokedPatientIds).toEqual([PATIENT_ID, SISTER_PATIENT_ID]);
    expect(mockAuditService.record).toHaveBeenCalledTimes(2);
  });

  it('confirms in Indonesian to the chat that asked, after the consent is written', async () => {
    const callOrder: string[] = [];
    mockConsentRepository.revoke.mockImplementation(async () => {
      callOrder.push('revoke');
      return undefined as never;
    });
    mockGateway.sendText.mockImplementation(async () => {
      callOrder.push('confirm');
    });

    await service.handleOptOut(buildMessage());

    expect(callOrder).toEqual(['revoke', 'confirm']);
    expect(mockGateway.sendText).toHaveBeenCalledWith({
      externalChatId: CHAT_ID,
      text: expect.stringContaining('tidak akan lagi mengirim dokumen'),
    });
  });

  it('still confirms when the chat is proven for nobody, and revokes nothing', async () => {
    mockGateRepository.findVerifiedPatientIdsForChat.mockResolvedValue([]);

    const actual = await service.handleOptOut(buildMessage());

    // "We will not send documents here" is already true; saying so costs
    // nothing and answering silence to a STOP is what gets a number reported.
    expect(actual).toBe(true);
    expect(mockConsentRepository.revoke).not.toHaveBeenCalled();
    expect(mockAuditService.record).not.toHaveBeenCalled();
    expect(mockGateway.sendText).toHaveBeenCalledTimes(1);
  });

  it('reports the message handled even when the confirmation cannot be sent', async () => {
    mockGateway.sendText.mockRejectedValue(new Error('bridge down'));

    const actual = await service.handleOptOut(buildMessage());

    // The consent is revoked, which is the part that matters. Handing the
    // message on to the bot now would answer "BERHENTI" with a model reply.
    expect(actual).toBe(true);
    expect(mockConsentRepository.revoke).toHaveBeenCalledTimes(1);
  });
});
