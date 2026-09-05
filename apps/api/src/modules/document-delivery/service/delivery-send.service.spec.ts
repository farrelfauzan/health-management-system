import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DeliveryRecord, InvoiceDeliverySubjectRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { MailService } from '../../../common/mail/mail.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliveryLinkService } from './delivery-link.service';
import {
  DeliverySendService,
  SEND_CANCELLED_CONSENT_PREFIX,
  SEND_CANCELLED_INVOICE_REASON,
  SEND_FAILED_MAIL_REJECTED,
} from './delivery-send.service';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';
import { ProtectDeliveryDocumentService } from './protect-delivery-document.service';

const PLAIN_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const LOCKED_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const CHAT_ID = '628129990024@s.whatsapp.net';

function buildDelivery(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'delivery-1',
    patientId: 'patient-1',
    invoiceId: 'invoice-1',
    invoiceDocumentId: 'doc-1',
    documentId: null,
    channel: 'WHATSAPP',
    shape: 'ATTACHMENT',
    destinationMasked: '6281****0024',
    status: 'QUEUED',
    attemptCount: 0,
    sendAt: null,
    nextAttemptAt: null,
    leasedUntil: new Date(),
    leasedBy: 'host:1',
    passwordSource: 'DOB_DDMMYYYY',
    providerMessageId: null,
    lastError: null,
    sentAt: null,
    openedAt: null,
    revokedAt: null,
    requestedBy: null,
    link: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildSubject(
  overrides: Partial<InvoiceDeliverySubjectRecord['invoice']> = {},
): InvoiceDeliverySubjectRecord {
  return {
    invoice: {
      id: 'invoice-1',
      invoiceNumber: 'INV/2026/09/000123',
      status: 'PAID',
      patientId: 'patient-1',
      totalAmount: 150_000,
      issuedAt: new Date('2026-09-29T02:00:00.000Z'),
      ...overrides,
    },
    document: { id: 'doc-1', status: 'READY', storageKey: 'invoices/doc-1.pdf' },
    patient: {
      id: 'patient-1',
      mrn: 'MRN-1',
      fullName: 'Rina',
      dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
      phoneNumber: '0812',
      email: 'rina@example.test',
    },
  };
}

describe('DeliverySendService', () => {
  let service: DeliverySendService;
  let mockRepository: {
    markSent: jest.Mock;
    rescheduleAttempt: jest.Mock;
    markFailed: jest.Mock;
    markCancelled: jest.Mock;
  };
  let mockInvoiceDocumentService: { findDeliverySubject: jest.Mock; buildFileName: jest.Mock };
  let mockConsentService: { isDeliveryAllowed: jest.Mock };
  let mockProtectService: { protectForPatient: jest.Mock; describeScheme: jest.Mock };
  let mockLinkService: { mintLink: jest.Mock };
  let mockStorage: { getObject: jest.Mock };
  let mockWhatsapp: { sendText: jest.Mock; sendDocument: jest.Mock };
  let mockMail: { sendMail: jest.Mock };
  let mockAudit: { record: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-29T08:00:00.000Z') });
    const configValues: Record<string, string> = {
      DELIVERY_MAX_ATTEMPTS: '3',
      DELIVERY_RETRY_BASE_DELAY_MS: '1000',
    };
    const configService = { get: jest.fn((key: string) => configValues[key]) };
    mockRepository = {
      markSent: jest.fn().mockResolvedValue(undefined),
      rescheduleAttempt: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markCancelled: jest.fn().mockResolvedValue(true),
    };
    mockInvoiceDocumentService = {
      findDeliverySubject: jest.fn().mockResolvedValue(buildSubject()),
      buildFileName: jest.fn().mockReturnValue('INV-2026-09-000123.pdf'),
    };
    mockConsentService = {
      isDeliveryAllowed: jest.fn().mockResolvedValue({
        isAllowed: true,
        refusalReason: null,
        destination: { channel: 'WHATSAPP', externalChatId: CHAT_ID, phoneNumber: '628129990024' },
      }),
    };
    mockProtectService = {
      protectForPatient: jest
        .fn()
        .mockResolvedValue({ content: LOCKED_PDF, passwordSource: 'DOB_DDMMYYYY' }),
      describeScheme: jest.fn().mockReturnValue('Buka dengan tanggal lahir, DDMMYYYY.'),
    };
    mockLinkService = {
      mintLink: jest.fn().mockResolvedValue({
        url: 'https://klinik.example.id/inv/tok',
        expiresAt: new Date('2026-10-06T08:00:00.000Z'),
      }),
    };
    mockStorage = {
      getObject: jest
        .fn()
        .mockResolvedValue({ key: 'invoices/doc-1.pdf', body: Buffer.from(PLAIN_PDF) }),
    };
    mockWhatsapp = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendDocument: jest.fn().mockResolvedValue(undefined),
    };
    mockMail = { sendMail: jest.fn().mockResolvedValue({ accepted: true, messageId: 'smtp-1' }) };
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new DeliverySendService(
      configService as unknown as ConfigService,
      mockRepository as unknown as DocumentDeliveryRepository,
      mockInvoiceDocumentService as unknown as InvoiceDocumentService,
      {
        getClinicName: jest.fn().mockResolvedValue('Klinik Sehat'),
      } as unknown as ClinicProfileService,
      mockConsentService as unknown as PatientDeliveryConsentService,
      mockProtectService as unknown as ProtectDeliveryDocumentService,
      mockLinkService as unknown as DeliveryLinkService,
      mockStorage as unknown as ObjectStorageService,
      mockWhatsapp as unknown as WhatsappGatewayService,
      mockMail as unknown as MailService,
      mockAudit as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('locks the pinned snapshot and sends it as a WhatsApp document with a caption naming the scheme', async () => {
    await service.processDelivery(buildDelivery());

    expect(mockInvoiceDocumentService.findDeliverySubject).toHaveBeenCalledWith(
      'invoice-1',
      'doc-1',
    );
    expect(mockProtectService.protectForPatient).toHaveBeenCalledWith({
      pdf: Buffer.from(PLAIN_PDF),
      patient: expect.objectContaining({ id: 'patient-1', mrn: 'MRN-1' }),
    });
    expect(mockWhatsapp.sendDocument).toHaveBeenCalledWith({
      externalChatId: CHAT_ID,
      fileName: 'INV-2026-09-000123.pdf',
      mimeType: 'application/pdf',
      content: LOCKED_PDF,
      caption: expect.stringContaining('Klinik Sehat: kuitansi INV/2026/09/000123 atas nama Rina'),
    });
    const caption = mockWhatsapp.sendDocument.mock.calls[0][0].caption as string;
    expect(caption).toContain('Buka dengan tanggal lahir, DDMMYYYY.');
    expect(mockRepository.markSent).toHaveBeenCalledWith({
      id: 'delivery-1',
      sentAt: new Date('2026-09-29T08:00:00.000Z'),
      providerMessageId: null,
    });
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELIVERY_SENT',
        actorUserId: null,
        patientId: 'patient-1',
      }),
    );
  });

  it('mints the link at send time and emails it without an attachment', async () => {
    mockConsentService.isDeliveryAllowed.mockResolvedValue({
      isAllowed: true,
      refusalReason: null,
      destination: { channel: 'EMAIL', email: 'rina@example.test' },
    });

    await service.processDelivery(
      buildDelivery({ channel: 'EMAIL', shape: 'LINK', passwordSource: null }),
    );

    expect(mockLinkService.mintLink).toHaveBeenCalledWith('delivery-1');
    expect(mockStorage.getObject).not.toHaveBeenCalled();
    expect(mockProtectService.protectForPatient).not.toHaveBeenCalled();
    expect(mockMail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rina@example.test',
        subject: expect.stringContaining('INV/2026/09/000123'),
        text: expect.stringContaining('https://klinik.example.id/inv/tok'),
        attachments: undefined,
      }),
    );
    expect(mockRepository.markSent).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: 'smtp-1' }),
    );
  });

  it('attaches the locked PDF on an email attachment delivery', async () => {
    mockConsentService.isDeliveryAllowed.mockResolvedValue({
      isAllowed: true,
      refusalReason: null,
      destination: { channel: 'EMAIL', email: 'rina@example.test' },
    });

    await service.processDelivery(buildDelivery({ channel: 'EMAIL' }));

    expect(mockMail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { fileName: 'INV-2026-09-000123.pdf', mimeType: 'application/pdf', content: LOCKED_PDF },
        ],
      }),
    );
  });

  it('cancels a send whose invoice was voided in the meantime, without touching the transport', async () => {
    mockInvoiceDocumentService.findDeliverySubject.mockResolvedValue(
      buildSubject({ status: 'VOID' }),
    );

    await service.processDelivery(buildDelivery());

    expect(mockRepository.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'delivery-1', reason: SEND_CANCELLED_INVOICE_REASON }),
    );
    expect(mockWhatsapp.sendDocument).not.toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELIVERY_CANCELLED',
        metadata: expect.objectContaining({ cancelledBy: 'WORKER' }),
      }),
    );
  });

  it('cancels a send whose consent was withdrawn since it was requested', async () => {
    mockConsentService.isDeliveryAllowed.mockResolvedValue({
      isAllowed: false,
      refusalReason: 'CONSENT_REVOKED',
      destination: null,
    });

    await service.processDelivery(buildDelivery());

    expect(mockRepository.markCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ reason: `${SEND_CANCELLED_CONSENT_PREFIX}:CONSENT_REVOKED` }),
    );
    expect(mockWhatsapp.sendDocument).not.toHaveBeenCalled();
  });

  it('backs off exponentially when the bridge is unavailable', async () => {
    mockWhatsapp.sendDocument.mockRejectedValue(new ServiceUnavailableException('bridge down'));

    await service.processDelivery(buildDelivery({ attemptCount: 1 }));

    expect(mockRepository.rescheduleAttempt).toHaveBeenCalledWith({
      id: 'delivery-1',
      error: 'ServiceUnavailableException',
      nextAttemptAt: new Date('2026-09-29T08:00:02.000Z'),
    });
    expect(mockRepository.markFailed).not.toHaveBeenCalled();
  });

  it('settles FAILED on the last allowed attempt and audits it', async () => {
    mockWhatsapp.sendDocument.mockRejectedValue(new ServiceUnavailableException('bridge down'));

    await service.processDelivery(buildDelivery({ attemptCount: 2 }));

    expect(mockRepository.markFailed).toHaveBeenCalledWith({
      id: 'delivery-1',
      error: 'ServiceUnavailableException',
    });
    expect(mockRepository.rescheduleAttempt).not.toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELIVERY_FAILED',
        metadata: expect.objectContaining({ attempt: 3 }),
      }),
    );
  });

  it('fails immediately when the mail transport rejects the address', async () => {
    mockConsentService.isDeliveryAllowed.mockResolvedValue({
      isAllowed: true,
      refusalReason: null,
      destination: { channel: 'EMAIL', email: 'rina@example.test' },
    });
    mockMail.sendMail.mockResolvedValue({ accepted: false, messageId: undefined });

    await service.processDelivery(buildDelivery({ channel: 'EMAIL' }));

    expect(mockRepository.markFailed).toHaveBeenCalledWith({
      id: 'delivery-1',
      error: SEND_FAILED_MAIL_REJECTED,
    });
  });

  it('fails a row it does not know how to send rather than leaving it claimed', async () => {
    await service.processDelivery(
      buildDelivery({ invoiceId: null, invoiceDocumentId: null, documentId: 'doc-x' }),
    );

    expect(mockRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNSUPPORTED_DELIVERY_SUBJECT' }),
    );
    expect(mockInvoiceDocumentService.findDeliverySubject).not.toHaveBeenCalled();
  });
});
