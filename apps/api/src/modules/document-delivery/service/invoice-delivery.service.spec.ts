import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import {
  DeliveryConsentCheckInput,
  DeliveryConsentCheckResult,
  DeliveryRecord,
  InvoiceDeliverySubjectRecord,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { InvoiceDocumentService } from '../../billing/service/invoice-document.service';
import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliveryPasswordService } from './delivery-password.service';
import {
  DELIVERY_CHANNEL_REFUSED_CODE,
  DELIVERY_NOT_RETRYABLE_CODE,
  DELIVERY_NOT_REVOCABLE_CODE,
  INVOICE_DOCUMENT_NOT_READY_CODE,
  INVOICE_NOT_DELIVERABLE_CODE,
  InvoiceDeliveryService,
} from './invoice-delivery.service';
import { PatientDeliveryConsentService } from './patient-delivery-consent.service';

const ACTOR = { sub: 'user-1', email: 'kasir@klinik.example' };
const INVOICE_ID = 'invoice-1';
const PATIENT_ID = 'patient-1';

function buildSubject(
  overrides: Partial<InvoiceDeliverySubjectRecord['invoice']> = {},
  document: InvoiceDeliverySubjectRecord['document'] = {
    id: 'doc-1',
    status: 'READY',
    storageKey: 'invoices/doc-1.pdf',
  },
): InvoiceDeliverySubjectRecord {
  return {
    invoice: {
      id: INVOICE_ID,
      invoiceNumber: 'INV-2026-09-000123',
      status: 'PAID',
      patientId: PATIENT_ID,
      totalAmount: 150_000,
      issuedAt: new Date('2026-09-29T08:00:00.000Z'),
      ...overrides,
    },
    document,
    patient: {
      id: PATIENT_ID,
      mrn: 'MRN-1',
      fullName: 'Rina',
      dateOfBirth: new Date('1988-03-07T00:00:00.000Z'),
      phoneNumber: '0812-9990-024',
      email: 'rina@example.test',
    },
  };
}

function buildRecord(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'delivery-1',
    patientId: PATIENT_ID,
    invoiceId: INVOICE_ID,
    invoiceDocumentId: 'doc-1',
    documentId: null,
    channel: 'WHATSAPP',
    shape: 'ATTACHMENT',
    destinationMasked: '6281****0024',
    status: 'QUEUED',
    attemptCount: 0,
    sendAt: null,
    nextAttemptAt: null,
    leasedUntil: null,
    leasedBy: null,
    passwordSource: 'DOB_DDMMYYYY',
    providerMessageId: null,
    lastError: null,
    sentAt: null,
    openedAt: null,
    revokedAt: null,
    requestedBy: { id: ACTOR.sub, email: ACTOR.email },
    link: null,
    createdAt: new Date('2026-09-29T08:00:00.000Z'),
    updatedAt: new Date('2026-09-29T08:00:00.000Z'),
    ...overrides,
  };
}

describe('InvoiceDeliveryService', () => {
  let service: InvoiceDeliveryService;
  let mockRepository: jest.Mocked<
    Pick<
      DocumentDeliveryRepository,
      'createMany' | 'findById' | 'findByInvoice' | 'markRetried' | 'markRevoked'
    >
  >;
  let mockInvoiceDocumentService: jest.Mocked<Pick<InvoiceDocumentService, 'findDeliverySubject'>>;
  let mockConsentService: jest.Mocked<Pick<PatientDeliveryConsentService, 'isDeliveryAllowed'>>;
  let mockPasswordService: { assertPasswordAvailable: jest.Mock; passwordSource: 'DOB_DDMMYYYY' };
  let mockAuditService: jest.Mocked<Pick<AuditService, 'record'>>;

  beforeEach(() => {
    mockRepository = {
      createMany: jest.fn(async (entries) =>
        entries.map((entry, index) =>
          buildRecord({
            id: `delivery-${index + 1}`,
            channel: entry.channel,
            shape: entry.shape,
            destinationMasked: entry.destinationMasked,
            passwordSource: entry.passwordSource,
          }),
        ),
      ),
      findById: jest.fn().mockResolvedValue(buildRecord()),
      findByInvoice: jest.fn().mockResolvedValue([buildRecord()]),
      markRetried: jest.fn().mockResolvedValue(true),
      markRevoked: jest.fn().mockResolvedValue(true),
    };
    mockInvoiceDocumentService = {
      findDeliverySubject: jest.fn().mockResolvedValue(buildSubject()),
    };
    mockConsentService = {
      isDeliveryAllowed: jest.fn(
        async (input: DeliveryConsentCheckInput): Promise<DeliveryConsentCheckResult> => ({
          isAllowed: true,
          refusalReason: null,
          destination:
            input.channel === 'EMAIL'
              ? { channel: 'EMAIL', email: 'rina@example.test' }
              : {
                  channel: 'WHATSAPP',
                  externalChatId: '628129990024@s.whatsapp.net',
                  phoneNumber: '628129990024',
                },
        }),
      ),
    };
    mockPasswordService = { assertPasswordAvailable: jest.fn(), passwordSource: 'DOB_DDMMYYYY' };
    mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new InvoiceDeliveryService(
      mockRepository as unknown as DocumentDeliveryRepository,
      mockInvoiceDocumentService as unknown as InvoiceDocumentService,
      mockConsentService as unknown as PatientDeliveryConsentService,
      mockPasswordService as unknown as DeliveryPasswordService,
      mockAuditService as unknown as AuditService,
    );
  });

  describe('requestInvoiceDelivery', () => {
    it('queues one locked attachment per channel with a masked destination, and audits each', async () => {
      await service.requestInvoiceDelivery(INVOICE_ID, { channels: ['WHATSAPP', 'EMAIL'] }, ACTOR);

      expect(mockPasswordService.assertPasswordAvailable).toHaveBeenCalledTimes(1);
      expect(mockRepository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({
          channel: 'WHATSAPP',
          shape: 'ATTACHMENT',
          destinationMasked: '6281****0024',
          passwordSource: 'DOB_DDMMYYYY',
          invoiceId: INVOICE_ID,
          invoiceDocumentId: 'doc-1',
          documentId: null,
          requestedById: ACTOR.sub,
        }),
        expect.objectContaining({
          channel: 'EMAIL',
          destinationMasked: 'r***@example.test',
          passwordSource: 'DOB_DDMMYYYY',
        }),
      ]);
      expect(mockAuditService.record).toHaveBeenCalledTimes(2);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELIVERY_REQUESTED',
          actorUserId: ACTOR.sub,
          patientId: PATIENT_ID,
          resourceId: 'delivery-1',
        }),
      );
    });

    it('records no password scheme and skips the password check on a link delivery', async () => {
      await service.requestInvoiceDelivery(
        INVOICE_ID,
        { channels: ['EMAIL'], shape: 'LINK' },
        ACTOR,
      );

      expect(mockPasswordService.assertPasswordAvailable).not.toHaveBeenCalled();
      expect(mockRepository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({ shape: 'LINK', passwordSource: null }),
      ]);
    });

    it('refuses a draft invoice before consent is even asked', async () => {
      mockInvoiceDocumentService.findDeliverySubject.mockResolvedValue(
        buildSubject({ status: 'DRAFT' }),
      );

      const actual = service.requestInvoiceDelivery(INVOICE_ID, { channels: ['WHATSAPP'] }, ACTOR);

      await expect(actual).rejects.toMatchObject({
        response: { code: INVOICE_NOT_DELIVERABLE_CODE },
      });
      await expect(actual).rejects.toBeInstanceOf(ConflictException);
      expect(mockConsentService.isDeliveryAllowed).not.toHaveBeenCalled();
      expect(mockRepository.createMany).not.toHaveBeenCalled();
    });

    it('refuses a voided invoice', async () => {
      mockInvoiceDocumentService.findDeliverySubject.mockResolvedValue(
        buildSubject({ status: 'VOID' }),
      );

      await expect(
        service.requestInvoiceDelivery(INVOICE_ID, { channels: ['WHATSAPP'] }, ACTOR),
      ).rejects.toMatchObject({ response: { code: INVOICE_NOT_DELIVERABLE_CODE } });
    });

    it('never sends a document that failed to render as pending', async () => {
      mockInvoiceDocumentService.findDeliverySubject.mockResolvedValue(
        buildSubject({}, { id: 'doc-1', status: 'FAILED', storageKey: null }),
      );

      await expect(
        service.requestInvoiceDelivery(INVOICE_ID, { channels: ['WHATSAPP'] }, ACTOR),
      ).rejects.toMatchObject({ response: { code: INVOICE_DOCUMENT_NOT_READY_CODE } });
      expect(mockRepository.createMany).not.toHaveBeenCalled();
    });

    it('refuses the whole request when one channel is refused, naming the channel and reason', async () => {
      mockConsentService.isDeliveryAllowed.mockImplementation(
        async (input): Promise<DeliveryConsentCheckResult> =>
          input.channel === 'EMAIL'
            ? { isAllowed: false, refusalReason: 'CONSENT_MISSING', destination: null }
            : {
                isAllowed: true,
                refusalReason: null,
                destination: {
                  channel: 'WHATSAPP',
                  externalChatId: '628129990024@s.whatsapp.net',
                  phoneNumber: '628129990024',
                },
              },
      );

      const actual = service.requestInvoiceDelivery(
        INVOICE_ID,
        { channels: ['WHATSAPP', 'EMAIL'] },
        ACTOR,
      );

      await expect(actual).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(actual).rejects.toMatchObject({
        response: {
          code: DELIVERY_CHANNEL_REFUSED_CODE,
          errors: { channel: 'EMAIL', refusalReason: 'CONSENT_MISSING' },
        },
      });
      expect(mockRepository.createMany).not.toHaveBeenCalled();
    });

    it('passes the actor to the gate so a wrong-patient refusal is attributed', async () => {
      await service.requestInvoiceDelivery(INVOICE_ID, { channels: ['WHATSAPP'] }, ACTOR);

      expect(mockConsentService.isDeliveryAllowed).toHaveBeenCalledWith(
        { patientId: PATIENT_ID, channel: 'WHATSAPP' },
        ACTOR.sub,
      );
    });

    it('lets a missing date of birth refuse an attachment before any row is written', async () => {
      mockPasswordService.assertPasswordAvailable.mockImplementation(() => {
        throw new UnprocessableEntityException({ code: 'DELIVERY_PASSWORD_SOURCE_MISSING' });
      });

      await expect(
        service.requestInvoiceDelivery(INVOICE_ID, { channels: ['WHATSAPP'] }, ACTOR),
      ).rejects.toMatchObject({ response: { code: 'DELIVERY_PASSWORD_SOURCE_MISSING' } });
      expect(mockRepository.createMany).not.toHaveBeenCalled();
    });
  });

  describe('listInvoiceDeliveries', () => {
    it('raises not-found for an invoice that does not exist', async () => {
      mockInvoiceDocumentService.findDeliverySubject.mockRejectedValue(new NotFoundException());

      await expect(service.listInvoiceDeliveries(INVOICE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps rows to the timeline without lease columns', async () => {
      const actual = await service.listInvoiceDeliveries(INVOICE_ID);

      expect(actual.invoiceId).toBe(INVOICE_ID);
      expect(actual.deliveries[0]).toEqual(
        expect.objectContaining({
          id: 'delivery-1',
          status: 'QUEUED',
          destinationMasked: '6281****0024',
        }),
      );
      expect(actual.deliveries[0]).not.toHaveProperty('leasedUntil');
    });
  });

  describe('retryDelivery', () => {
    it('queues a failed delivery again and audits it', async () => {
      mockRepository.findById
        .mockResolvedValueOnce(buildRecord({ status: 'FAILED', attemptCount: 5 }))
        .mockResolvedValueOnce(buildRecord({ status: 'QUEUED', attemptCount: 5 }));

      const actual = await service.retryDelivery('delivery-1', ACTOR);

      expect(mockRepository.markRetried).toHaveBeenCalledWith('delivery-1');
      expect(actual.status).toBe('QUEUED');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELIVERY_RETRIED', resourceId: 'delivery-1' }),
      );
    });

    it('refuses to retry anything but a failed delivery', async () => {
      await expect(service.retryDelivery('delivery-1', ACTOR)).rejects.toMatchObject({
        response: { code: DELIVERY_NOT_RETRYABLE_CODE, errors: { status: 'QUEUED' } },
      });
      expect(mockRepository.markRetried).not.toHaveBeenCalled();
    });

    it('raises not-found for an unknown delivery', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.retryDelivery('missing', ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('revokeDelivery', () => {
    it('withdraws a queued attachment before it is sent', async () => {
      mockRepository.findById
        .mockResolvedValueOnce(buildRecord())
        .mockResolvedValueOnce(buildRecord({ status: 'REVOKED' }));

      const actual = await service.revokeDelivery('delivery-1', ACTOR);

      expect(mockRepository.markRevoked).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'delivery-1', fromStatuses: ['QUEUED', 'FAILED'] }),
      );
      expect(actual.status).toBe('REVOKED');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELIVERY_REVOKED',
          metadata: expect.objectContaining({ fromStatus: 'QUEUED' }),
        }),
      );
    });

    it('kills a sent link', async () => {
      mockRepository.findById
        .mockResolvedValueOnce(buildRecord({ shape: 'LINK', status: 'SENT' }))
        .mockResolvedValueOnce(buildRecord({ shape: 'LINK', status: 'REVOKED' }));

      const actual = await service.revokeDelivery('delivery-1', ACTOR);

      expect(mockRepository.markRevoked).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatuses: ['QUEUED', 'FAILED', 'SENT', 'DELIVERED', 'OPENED'],
        }),
      );
      expect(actual.status).toBe('REVOKED');
    });

    it('will not pretend a sent attachment can be taken back', async () => {
      mockRepository.findById.mockResolvedValue(buildRecord({ status: 'SENT' }));

      await expect(service.revokeDelivery('delivery-1', ACTOR)).rejects.toMatchObject({
        response: {
          code: DELIVERY_NOT_REVOCABLE_CODE,
          errors: { status: 'SENT', shape: 'ATTACHMENT' },
        },
      });
      expect(mockRepository.markRevoked).not.toHaveBeenCalled();
    });

    it('reports a lost race as a conflict rather than a success', async () => {
      mockRepository.markRevoked.mockResolvedValue(false);

      await expect(service.revokeDelivery('delivery-1', ACTOR)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });
});
