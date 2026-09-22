import { Logger } from '@nestjs/common';

import { MaternalDueRecord, VisitReminderRecipientRecord } from '@hms/shared-types';

import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { DeliveryChannelGateService } from '../../document-delivery/service/delivery-channel-gate.service';
import { MaternalVisitDueService } from '../../maternal-care/service/maternal-visit-due.service';
import { VisitReminderConsentService } from '../../visit-reminder-consent/service/visit-reminder-consent.service';
import { MaternalVisitReminderRepository } from '../repository/maternal-visit-reminder.repository';
import { MaternalVisitReminderService } from './maternal-visit-reminder.service';

const TODAY = '2026-10-01';
const CHAT_ID = '6281200000017@s.whatsapp.net';
const RINA: VisitReminderRecipientRecord = {
  id: 'patient-rina',
  phoneNumber: '081200000017',
  email: null,
};

function buildRecord(overrides: Partial<MaternalDueRecord> = {}): MaternalDueRecord {
  return {
    visitKey: 'PNC:episode-rina:KF2',
    source: 'POSTNATAL',
    code: 'KF2',
    subject: 'PATIENT',
    patientId: RINA.id,
    patientName: 'Rina',
    medicalRecordNumber: 'RM-1',
    dueFrom: '2026-10-02',
    dueUntil: '2026-10-06',
    ...overrides,
  };
}

describe('MaternalVisitReminderService', () => {
  let mockDueService: jest.Mocked<
    Pick<MaternalVisitDueService, 'resolveClinicToday' | 'resolveRange' | 'listDueForReminders'>
  >;
  let mockConsentService: jest.Mocked<Pick<VisitReminderConsentService, 'listConsentedRecipients'>>;
  let mockGateService: jest.Mocked<Pick<DeliveryChannelGateService, 'resolveWhatsappGate'>>;
  let mockGateway: jest.Mocked<Pick<WhatsappGatewayService, 'sendText'>>;
  let mockClinicProfileService: jest.Mocked<Pick<ClinicProfileService, 'getClinicName'>>;
  let mockRepository: jest.Mocked<
    Pick<MaternalVisitReminderRepository, 'claim' | 'markSent' | 'markFailed'>
  >;
  let service: MaternalVisitReminderService;

  beforeEach(() => {
    mockDueService = {
      resolveClinicToday: jest.fn().mockReturnValue(TODAY),
      resolveRange: jest.fn().mockReturnValue({ from: TODAY, to: '2026-10-07' }),
      listDueForReminders: jest.fn().mockResolvedValue([buildRecord()]),
    };
    mockConsentService = { listConsentedRecipients: jest.fn().mockResolvedValue([RINA]) };
    mockGateService = {
      resolveWhatsappGate: jest.fn().mockResolvedValue({
        isAllowed: true,
        refusalReason: null,
        link: {
          id: 'link-1',
          externalChatId: CHAT_ID,
          phoneNumber: '6281200000017',
          patientId: RINA.id,
          isVerified: true,
        },
      }),
    };
    mockGateway = { sendText: jest.fn().mockResolvedValue(undefined) };
    mockClinicProfileService = { getClinicName: jest.fn().mockResolvedValue('Klinik Bidan Sehat') };
    mockRepository = {
      claim: jest.fn().mockResolvedValue({
        id: 'reminder-1',
        patientId: RINA.id,
        visitKey: 'PNC:episode-rina:KF2',
        status: 'PENDING',
        attemptedAt: new Date(),
      }),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service = new MaternalVisitReminderService(
      mockDueService as unknown as MaternalVisitDueService,
      mockConsentService as unknown as VisitReminderConsentService,
      mockGateService as unknown as DeliveryChannelGateService,
      mockGateway as unknown as WhatsappGatewayService,
      mockClinicProfileService as unknown as ClinicProfileService,
      mockRepository as unknown as MaternalVisitReminderRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends one short message to the verified chat of a consenting patient', async () => {
    const actual = await service.sendDueReminders();

    expect(actual).toBe(1);
    expect(mockGateway.sendText).toHaveBeenCalledTimes(1);
    const actualRequest = mockGateway.sendText.mock.calls[0]?.[0];
    expect(actualRequest?.externalChatId).toBe(CHAT_ID);
    expect(actualRequest?.text).toContain('Klinik Bidan Sehat');
    expect(actualRequest?.text).toContain('kunjungan nifas');
    expect(actualRequest?.text).toContain('BERHENTI');
    expect(mockRepository.markSent).toHaveBeenCalledWith(['reminder-1'], expect.any(Date));
  });

  it('sends nothing for a visit whose reminder is already claimed', async () => {
    mockRepository.claim.mockResolvedValue(null);

    const actual = await service.sendDueReminders();

    expect(actual).toBe(0);
    expect(mockGateway.sendText).not.toHaveBeenCalled();
  });

  it('sends nothing and claims nothing for a patient without reminder consent', async () => {
    mockConsentService.listConsentedRecipients.mockResolvedValue([]);

    const actual = await service.sendDueReminders();

    expect(actual).toBe(0);
    expect(mockRepository.claim).not.toHaveBeenCalled();
    expect(mockGateway.sendText).not.toHaveBeenCalled();
  });

  it('keeps the reminder unclaimed while her number is not verified', async () => {
    mockGateService.resolveWhatsappGate.mockResolvedValue({
      isAllowed: false,
      refusalReason: 'NUMBER_UNVERIFIED',
      link: null,
    });

    await service.sendDueReminders();

    expect(mockRepository.claim).not.toHaveBeenCalled();
    expect(mockGateway.sendText).not.toHaveBeenCalled();
  });

  it('skips a window that has already closed', async () => {
    mockDueService.listDueForReminders.mockResolvedValue([buildRecord({ dueUntil: '2026-09-30' })]);

    await service.sendDueReminders();

    expect(mockConsentService.listConsentedRecipients).toHaveBeenCalledWith([]);
    expect(mockGateway.sendText).not.toHaveBeenCalled();
  });

  it('sends one message for several visits of the same patient, claiming each', async () => {
    mockDueService.listDueForReminders.mockResolvedValue([
      buildRecord(),
      buildRecord({ visitKey: 'PNC:episode-rina:KN2', code: 'KN2', subject: 'NEWBORN' }),
    ]);

    const actual = await service.sendDueReminders();

    expect(actual).toBe(1);
    expect(mockRepository.claim).toHaveBeenCalledTimes(2);
    expect(mockGateway.sendText).toHaveBeenCalledTimes(1);
    expect(mockGateway.sendText.mock.calls[0]?.[0].text).toContain(
      'kunjungan nifas dan kunjungan bayi',
    );
  });

  it('claims before sending and records a failed send without retrying it', async () => {
    const callOrder: string[] = [];
    mockRepository.claim.mockImplementation(async () => {
      callOrder.push('claim');
      return {
        id: 'reminder-1',
        patientId: RINA.id,
        visitKey: 'k',
        status: 'PENDING',
        attemptedAt: new Date(),
      };
    });
    mockGateway.sendText.mockImplementation(async () => {
      callOrder.push('send');
      throw new TypeError('bridge down');
    });

    const actual = await service.sendDueReminders();

    expect(actual).toBe(0);
    expect(callOrder).toEqual(['claim', 'send']);
    expect(mockRepository.markFailed).toHaveBeenCalledWith(['reminder-1'], 'TypeError');
    expect(mockRepository.markSent).not.toHaveBeenCalled();
  });

  it('never names the visit type for KB or SHK in the message', async () => {
    mockDueService.listDueForReminders.mockResolvedValue([
      buildRecord({ visitKey: 'KB:kb-1:2026-10-02', source: 'FAMILY_PLANNING', code: 'PILL' }),
      buildRecord({ visitKey: 'SHK:shk-1', source: 'SHK', code: 'SHK1', subject: 'NEWBORN' }),
    ]);

    await service.sendDueReminders();

    const actualTexts = mockGateway.sendText.mock.calls.map(([request]) => request.text).join('\n');
    expect(actualTexts).toContain('kunjungan kontrol');
    expect(actualTexts).toContain('kunjungan bayi');
    expect(actualTexts).not.toMatch(/\bKB\b|SHK|skrining|kontrasepsi|PILL/i);
  });
});
