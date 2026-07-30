import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { GenerateInvoiceDto } from '../dto/generate-invoice.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { VoidInvoiceDto } from '../dto/void-invoice.dto';
import { BillingRepository } from '../repository/billing.repository';
import { ServiceTariffRepository } from '../repository/service-tariff.repository';
import { BillingMapper } from './billing.mapper';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  const billingRepositoryMock = {
    findEncounterForBilling: jest.fn(),
    findDispensedItemsByEncounterId: jest.fn(),
    findLiveInvoiceByEncounterId: jest.fn(),
    createInvoiceWithItems: jest.fn(),
    listInvoices: jest.fn(),
    findInvoiceWithRelationsById: jest.fn(),
    findInvoiceDetailById: jest.fn(),
    issueInvoice: jest.fn(),
    recordPayment: jest.fn(),
    voidInvoice: jest.fn(),
  };

  const serviceTariffRepositoryMock = {
    findServiceTariffById: jest.fn(),
    findActiveConsultationTariffs: jest.fn(),
    findActiveTariffsByIcd9cmCodes: jest.fn(),
  };

  const auditServiceMock = {
    record: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn().mockReturnValue('Asia/Jakarta'),
  };

  const service = new BillingService(
    billingRepositoryMock as unknown as BillingRepository,
    serviceTariffRepositoryMock as unknown as ServiceTariffRepository,
    new BillingMapper(),
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  const cashierUser = { sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8', email: 'admin@hms.local' };
  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const invoiceId = 'b4c5d6e7-f8a9-4b0c-9d1e-2f3a4b5c6d7e';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const consultationTariffId = '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e';
  const procedureTariffId = '8c1d2f69-5a7b-4a7f-8e21-3b0d4a5c6e7f';
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const finishedEncounter = {
    id: encounterId,
    status: 'FINISHED' as const,
    patientId,
    procedures: [
      { id: 'procedure-1', code: '99.21', display: 'Injection of antibiotic' },
      { id: 'procedure-2', code: '99.21', display: 'Injection of antibiotic' },
    ],
  };

  const consultationTariff = {
    id: consultationTariffId,
    code: 'KONSULTASI-UMUM',
    name: 'Konsultasi Dokter Umum',
    category: 'CONSULTATION' as const,
    icd9cmCode: null,
    price: 50000,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const procedureTariff = {
    id: procedureTariffId,
    code: 'TIND-INJEKSI-AB',
    name: 'Injeksi Antibiotik',
    category: 'PROCEDURE' as const,
    icd9cmCode: '99.21',
    price: 35000,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const patientRecord = { id: patientId, mrn: '00000001', fullName: 'Aisha Rahman', ownerUserId: null };

  const invoiceRecord = {
    id: invoiceId,
    invoiceNumber: 'INV/20260728/0001',
    encounterId,
    patientId,
    status: 'DRAFT' as const,
    totalAmount: 156500,
    issuedAt: null,
    voidedAt: null,
    voidReason: null,
    voidedById: null,
    createdById: cashierUser.sub,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const invoiceWithRelationsRecord = {
    ...invoiceRecord,
    patient: patientRecord,
    _count: { items: 3 },
  };

  const invoiceDetailRecord = {
    ...invoiceRecord,
    patient: patientRecord,
    items: [],
    payment: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    billingRepositoryMock.findEncounterForBilling.mockResolvedValue(finishedEncounter);
    billingRepositoryMock.findLiveInvoiceByEncounterId.mockResolvedValue(null);
    billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([]);
    billingRepositoryMock.createInvoiceWithItems.mockResolvedValue(invoiceDetailRecord);
    serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([
      consultationTariff,
    ]);
    serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([
      procedureTariff,
    ]);
  });

  describe('generateInvoice', () => {
    const inputPayload = { encounterId } as GenerateInvoiceDto;

    it('collects the consultation fee, grouped procedures, and dispensed medications', async () => {
      billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
        {
          medicationId: 'medication-1',
          quantity: 10,
          medication: { id: 'medication-1', name: 'Amoxicillin 500 mg', unitPrice: 1500 },
        },
        {
          medicationId: 'medication-1',
          quantity: 5,
          medication: { id: 'medication-1', name: 'Amoxicillin 500 mg', unitPrice: 1500 },
        },
      ]);

      const actualResult = await service.generateInvoice(inputPayload, cashierUser);

      const createPayload = billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0];
      expect(createPayload.items).toEqual([
        expect.objectContaining({
          itemType: 'CONSULTATION',
          serviceTariffId: consultationTariffId,
          quantity: 1,
          unitPrice: 50000,
          amount: 50000,
        }),
        expect.objectContaining({
          itemType: 'PROCEDURE',
          serviceTariffId: procedureTariffId,
          quantity: 2,
          unitPrice: 35000,
          amount: 70000,
        }),
        expect.objectContaining({
          itemType: 'MEDICATION',
          medicationId: 'medication-1',
          quantity: 15,
          unitPrice: 1500,
          amount: 22500,
        }),
      ]);
      expect(createPayload.totalAmount).toBe(142500);
      expect(actualResult.gaps).toEqual([]);
    });

    it('reports unpriced billables as gaps instead of dropping them silently', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
        {
          medicationId: 'medication-2',
          quantity: 10,
          medication: { id: 'medication-2', name: 'Paracetamol 500 mg', unitPrice: null },
        },
      ]);

      const actualResult = await service.generateInvoice(inputPayload, cashierUser);

      expect(actualResult.gaps).toEqual([
        expect.objectContaining({ reason: 'NO_CONSULTATION_TARIFF' }),
        expect.objectContaining({ reason: 'NO_TARIFF_FOR_PROCEDURE', code: '99.21' }),
        expect.objectContaining({
          reason: 'UNPRICED_MEDICATION',
          description: 'Paracetamol 500 mg',
        }),
      ]);
      expect(billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0].items).toEqual([]);
    });

    it('rejects an encounter that is not FINISHED', async () => {
      billingRepositoryMock.findEncounterForBilling.mockResolvedValue({
        ...finishedEncounter,
        status: 'IN_PROGRESS',
      });

      await expect(service.generateInvoice(inputPayload, cashierUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(billingRepositoryMock.createInvoiceWithItems).not.toHaveBeenCalled();
    });

    it('rejects an encounter that already has a live invoice', async () => {
      billingRepositoryMock.findLiveInvoiceByEncounterId.mockResolvedValue({ id: invoiceId });

      await expect(service.generateInvoice(inputPayload, cashierUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('requires an explicit choice when several consultation tariffs are active', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([
        consultationTariff,
        { ...consultationTariff, id: 'other-tariff', code: 'KONSULTASI-GIGI' },
      ]);

      await expect(service.generateInvoice(inputPayload, cashierUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a consultationTariffId that is not an active consultation tariff', async () => {
      serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue(procedureTariff);

      await expect(
        service.generateInvoice(
          { encounterId, consultationTariffId: procedureTariffId } as GenerateInvoiceDto,
          cashierUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('issueInvoice', () => {
    it('issues a DRAFT invoice', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(
        invoiceWithRelationsRecord,
      );
      billingRepositoryMock.issueInvoice.mockResolvedValue({
        ...invoiceDetailRecord,
        status: 'ISSUED',
        issuedAt: timestamp,
      });

      const actualResult = await service.issueInvoice(invoiceId);

      expect(actualResult.status).toBe('ISSUED');
    });

    it('rejects issuing an already issued invoice', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
        ...invoiceWithRelationsRecord,
        status: 'ISSUED',
      });

      await expect(service.issueInvoice(invoiceId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 for an unknown invoice', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(null);

      await expect(service.issueInvoice(invoiceId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recordPayment', () => {
    const inputPayload = { method: 'CASH', amount: 156500 } as RecordPaymentDto;

    it('settles an ISSUED invoice whose amount matches the total', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
        ...invoiceWithRelationsRecord,
        status: 'ISSUED',
      });
      billingRepositoryMock.recordPayment.mockResolvedValue({
        ...invoiceDetailRecord,
        status: 'PAID',
      });

      const actualResult = await service.recordPayment(invoiceId, inputPayload, cashierUser);

      expect(actualResult.status).toBe('PAID');
      expect(billingRepositoryMock.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId,
          method: 'CASH',
          amount: 156500,
          cashierId: cashierUser.sub,
        }),
      );
    });

    it('rejects an amount that does not repeat the invoice total', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
        ...invoiceWithRelationsRecord,
        status: 'ISSUED',
      });

      await expect(
        service.recordPayment(invoiceId, { method: 'CASH', amount: 100000 } as RecordPaymentDto, cashierUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(billingRepositoryMock.recordPayment).not.toHaveBeenCalled();
    });

    it('rejects paying a DRAFT invoice', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(
        invoiceWithRelationsRecord,
      );

      await expect(
        service.recordPayment(invoiceId, inputPayload, cashierUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('voidInvoice', () => {
    const inputPayload = { reason: 'Wrong tariff applied' } as VoidInvoiceDto;

    it('voids an ISSUED invoice and records the audit event', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
        ...invoiceWithRelationsRecord,
        status: 'ISSUED',
      });
      billingRepositoryMock.voidInvoice.mockResolvedValue({
        ...invoiceDetailRecord,
        status: 'VOID',
        voidedAt: timestamp,
        voidReason: inputPayload.reason,
        voidedById: cashierUser.sub,
      });

      const actualResult = await service.voidInvoice(invoiceId, inputPayload, cashierUser);

      expect(actualResult.status).toBe('VOID');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_VOIDED',
          resource: 'Invoice',
          resourceId: invoiceId,
          actorUserId: cashierUser.sub,
          metadata: { previousStatus: 'ISSUED' },
        }),
      );
      expect(JSON.stringify(auditServiceMock.record.mock.calls)).not.toContain(
        invoiceWithRelationsRecord.invoiceNumber,
      );
      expect(JSON.stringify(auditServiceMock.record.mock.calls)).not.toContain(inputPayload.reason);
    });

    it('rejects voiding a PAID invoice — refunds are out of scope in v1', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
        ...invoiceWithRelationsRecord,
        status: 'PAID',
      });

      await expect(
        service.voidInvoice(invoiceId, inputPayload, cashierUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });
  });
});
