import type { BillingLabItemRecord, ServiceTariffRecord } from '@hms/shared-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { AddInvoiceItemDto } from '../dto/add-invoice-item.dto';
import { GenerateInvoiceDto } from '../dto/generate-invoice.dto';
import { GenerateLabOnlyInvoiceDto } from '../dto/generate-lab-only-invoice.dto';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { VoidInvoiceDto } from '../dto/void-invoice.dto';
import { BillingRepository } from '../repository/billing.repository';
import { ServiceTariffRepository } from '../repository/service-tariff.repository';
import { BillingMapper } from './billing.mapper';
import { BillingService } from './billing.service';
import { InvoiceDocumentService } from './invoice-document.service';

describe('BillingService', () => {
  const billingRepositoryMock = {
    findEncounterForBilling: jest.fn(),
    findDispensedItemsByEncounterId: jest.fn(),
    findLabItemsForBilling: jest.fn<Promise<BillingLabItemRecord[]>, [string]>(() =>
      Promise.resolve([]),
    ),
    findClinicalRequestsForEncounter: jest.fn(() => Promise.resolve([])),
    findVisitIdsWithSettledInvoice: jest.fn(() => Promise.resolve(new Set<string>())),
    findLiveInvoiceByEncounterId: jest.fn(),
    findLiveInvoiceByRegistrationId: jest.fn(),
    findVisitForBilling: jest.fn(),
    createInvoiceWithItems: jest.fn(),
    listInvoices: jest.fn(),
    findInvoiceWithRelationsById: jest.fn(),
    findInvoiceDetailById: jest.fn(),
    issueInvoice: jest.fn(),
    recordPayment: jest.fn(),
    voidInvoice: jest.fn(),
    addInvoiceItem: jest.fn(),
    removeInvoiceItem: jest.fn(),
  };

  const serviceTariffRepositoryMock = {
    findServiceTariffById: jest.fn(),
    findActiveConsultationTariffs: jest.fn(),
    findActiveTariffsByIcd9cmCodes: jest.fn(),
    findActiveTariffsByCodes: jest.fn<Promise<ServiceTariffRecord[]>, [string[]]>(() =>
      Promise.resolve([]),
    ),
  };

  const auditServiceMock = {
    record: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn().mockReturnValue('Asia/Jakarta'),
  };

  const invoiceDocumentServiceMock = {
    snapshotOnIssue: jest.fn().mockResolvedValue(undefined),
  };

  const service = new BillingService(
    billingRepositoryMock as unknown as BillingRepository,
    serviceTariffRepositoryMock as unknown as ServiceTariffRepository,
    new BillingMapper(),
    auditServiceMock as unknown as AuditService,
    invoiceDocumentServiceMock as unknown as InvoiceDocumentService,
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
    immunizations: [],
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

  const labPanelTariffId = '9d2e3a7a-6b8c-4b80-9f32-4c1e5b6d7f80';
  const labTestTariffId = 'ae3f4b8b-7c9d-4c91-8043-5d2f6c7e8091';
  const labPanelId = 'bf405c9c-8dae-4da2-9154-6e3a7d8f9102';

  /** A darah-rutin member: priced through its panel, never on its own. */
  function buildLabItem(fields: {
    testCode: string;
    testName: string;
    chargeMode?: 'CLINIC' | 'EXTERNAL' | 'COVERED';
  }) {
    return {
      labOrderId: 'lab-order-1',
      orderNumber: 'LAB/20260728/0001',
      chargeMode: fields.chargeMode ?? ('CLINIC' as const),
      labTestId: `test-${fields.testCode}`,
      testCode: fields.testCode,
      testName: fields.testName,
      testTariffId: null,
      testPrice: null,
      panelId: labPanelId,
      panelName: 'Darah Rutin',
      panelTariffId: labPanelTariffId,
      panelPrice: 90000,
    };
  }

  const patientRecord = {
    id: patientId,
    mrn: '00000001',
    fullName: 'Aisha Rahman',
    ownerUserId: null,
  };

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
    serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([procedureTariff]);
  });

  describe('generateLabOnlyInvoice', () => {
    const registrationId = '9f8e7d6c-5b4a-4390-8271-6a5b4c3d2e1f';
    const inputPayload = { registrationId } as GenerateLabOnlyInvoiceDto;

    beforeEach(() => {
      billingRepositoryMock.findVisitForBilling.mockResolvedValue({
        id: registrationId,
        patientId,
        type: 'LAB_ONLY',
        status: 'COMPLETED',
      });
      billingRepositoryMock.findLiveInvoiceByRegistrationId.mockResolvedValue(null);
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([
        {
          labOrderId: 'lab-order-1',
          orderNumber: 'LAB/20260728/0042',
          chargeMode: 'CLINIC',
          labTestId: 'lab-test-1',
          testCode: 'GDS',
          testName: 'Glukosa Darah Sewaktu',
          testTariffId: 'tariff-lab-1',
          testPrice: 35000,
          panelId: null,
          panelName: null,
          panelTariffId: null,
          panelPrice: null,
        },
      ] as BillingLabItemRecord[]);
    });

    it('bills the tests and nothing else — there was no consultation to charge for', async () => {
      await service.generateLabOnlyInvoice(inputPayload, cashierUser);

      const createPayload = billingRepositoryMock.createInvoiceWithItems.mock.calls.at(-1)?.[0];
      expect(createPayload.registrationId).toBe(registrationId);
      expect(createPayload.encounterId).toBeUndefined();
      expect(createPayload.items).toHaveLength(1);
      expect(createPayload.items[0]).toEqual(
        expect.objectContaining({ itemType: 'LAB', serviceTariffId: 'tariff-lab-1' }),
      );
      // The lab is asked for the visit's tests, not an encounter's.
      expect(billingRepositoryMock.findLabItemsForBilling).toHaveBeenCalledWith(registrationId);
    });

    it('refuses a visit that has an encounter, so the consultation is not lost', async () => {
      billingRepositoryMock.findVisitForBilling.mockResolvedValue({
        id: registrationId,
        patientId,
        type: 'CONSULTATION',
        status: 'COMPLETED',
      });

      await expect(service.generateLabOnlyInvoice(inputPayload, cashierUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a second live invoice for the same visit', async () => {
      billingRepositoryMock.findLiveInvoiceByRegistrationId.mockResolvedValue({ id: 'invoice-1' });

      await expect(service.generateLabOnlyInvoice(inputPayload, cashierUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a visit with nothing on it to bill', async () => {
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([]);

      await expect(service.generateLabOnlyInvoice(inputPayload, cashierUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('generateInvoice', () => {
    const inputPayload = { encounterId } as GenerateInvoiceDto;

    it('collects the consultation fee, grouped procedures, and dispensed medications', async () => {
      billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
        {
          medicationId: 'medication-1',
          quantity: 10,
          medication: { id: 'medication-1', name: 'Amoxicillin 500 mg', unitPrice: 1500 },
          compound: null,
        },
        {
          medicationId: 'medication-1',
          quantity: 5,
          medication: { id: 'medication-1', name: 'Amoxicillin 500 mg', unitPrice: 1500 },
          compound: null,
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

    it('prices a racikan as the sum of its ingredients plus the compounding fee', async () => {
      billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
        {
          medicationId: null,
          quantity: 10,
          medication: null,
          compound: {
            prescriptionItemId: 'presc-item-compound',
            name: 'Puyer batuk pilek',
            components: [
              {
                medicationId: 'medication-1',
                name: 'Paracetamol 500 mg',
                quantityPerCompound: 0.5,
                unitPrice: 1000,
              },
              {
                medicationId: 'medication-2',
                name: 'CTM 4 mg',
                quantityPerCompound: 0.25,
                unitPrice: 400,
              },
            ],
          },
        },
      ]);
      serviceTariffRepositoryMock.findActiveTariffsByCodes.mockResolvedValue([
        {
          id: 'tariff-racik',
          code: 'JASA-RACIK',
          name: 'Jasa Racik',
          category: 'OTHER' as const,
          icd9cmCode: null,
          roomClass: null,
          price: 5000,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);

      await service.generateInvoice(inputPayload, cashierUser);

      const createPayload = billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0];
      expect(createPayload.items).toEqual(
        expect.arrayContaining([
          // 0.5 × 1000 + 0.25 × 400 = 600 per bungkus, ten of them.
          expect.objectContaining({
            description: 'Puyer batuk pilek',
            quantity: 10,
            unitPrice: 600,
            amount: 6000,
          }),
          expect.objectContaining({ description: 'Jasa Racik', quantity: 10 }),
        ]),
      );
    });

    it('gaps a whole racikan when one ingredient has no price, rather than half-pricing it', async () => {
      billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
        {
          medicationId: null,
          quantity: 10,
          medication: null,
          compound: {
            prescriptionItemId: 'presc-item-compound',
            name: 'Puyer batuk pilek',
            components: [
              {
                medicationId: 'medication-1',
                name: 'Paracetamol 500 mg',
                quantityPerCompound: 0.5,
                unitPrice: 1000,
              },
              {
                medicationId: 'medication-2',
                name: 'CTM 4 mg',
                quantityPerCompound: 0.25,
                unitPrice: null,
              },
            ],
          },
        },
      ]);
      serviceTariffRepositoryMock.findActiveTariffsByCodes.mockResolvedValue([]);

      const actualResult = await service.generateInvoice(inputPayload, cashierUser);

      const createPayload = billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0];
      expect(createPayload.items).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ description: 'Puyer batuk pilek' })]),
      );
      expect(actualResult.gaps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'UNPRICED_COMPOUND_COMPONENT',
            description: expect.stringContaining('CTM 4 mg'),
          }),
        ]),
      );
    });

    it('reports unpriced billables as gaps instead of dropping them silently', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findDispensedItemsByEncounterId.mockResolvedValue([
        {
          medicationId: 'medication-2',
          quantity: 10,
          medication: { id: 'medication-2', name: 'Paracetamol 500 mg', unitPrice: null },
          compound: null,
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

    // P18-T06. A panel is one line at the panel's own tariff however many
    // tests it expanded into: charging six members of a darah rutin separately
    // would bill the patient several times what the clinic quoted.
    it('bills a lab panel once and a loose test on its own', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([
        buildLabItem({ testCode: 'HB', testName: 'Hemoglobin' }),
        buildLabItem({ testCode: 'LEU', testName: 'Leukosit' }),
        buildLabItem({ testCode: 'TRO', testName: 'Trombosit' }),
        {
          ...buildLabItem({ testCode: 'GDS', testName: 'Glukosa Darah Sewaktu' }),
          testTariffId: labTestTariffId,
          testPrice: 25000,
          panelId: null,
          panelName: null,
          panelTariffId: null,
          panelPrice: null,
        },
      ]);

      const actualResult = await service.generateInvoice(inputPayload, cashierUser);

      expect(actualResult.gaps).toEqual([
        expect.objectContaining({ reason: 'NO_CONSULTATION_TARIFF' }),
        expect.objectContaining({ reason: 'NO_TARIFF_FOR_PROCEDURE' }),
      ]);
      expect(billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0].items).toEqual([
        expect.objectContaining({
          itemType: 'LAB',
          serviceTariffId: labPanelTariffId,
          description: 'Darah Rutin',
          quantity: 1,
          amount: 90000,
        }),
        expect.objectContaining({
          itemType: 'LAB',
          serviceTariffId: labTestTariffId,
          description: 'Glukosa Darah Sewaktu',
          quantity: 1,
          amount: 25000,
        }),
      ]);
    });

    // The procedure rule from P9 applied to the bench. Free lab work is the
    // failure this prevents: the tests are recorded, so an omission would stay
    // invisible until somebody reconciled a month of them.
    it('gaps an unpriced lab test rather than billing it at nothing', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([
        {
          ...buildLabItem({ testCode: 'HBA1C', testName: 'HbA1c' }),
          testTariffId: null,
          testPrice: null,
          panelId: null,
          panelName: null,
          panelTariffId: null,
          panelPrice: null,
        },
      ]);

      const actualResult = await service.generateInvoice(inputPayload, cashierUser);

      expect(actualResult.gaps).toContainEqual(
        expect.objectContaining({
          reason: 'NO_TARIFF_FOR_LAB_TEST',
          code: 'HBA1C',
          description: 'HbA1c',
        }),
      );
      expect(billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0].items).toEqual([]);
    });

    // P18-T11. The outside lab charges the patient directly; billing it here
    // would charge them twice for one test.
    it('never bills lab work another facility is charging for', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([
        buildLabItem({ testCode: 'HB', testName: 'Hemoglobin', chargeMode: 'EXTERNAL' }),
      ]);

      await service.generateInvoice(inputPayload, cashierUser);

      expect(billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0].items).toEqual([]);
    });

    // A payer settles it away from the counter, so the receipt must not ask
    // the patient for it either.
    it('never bills lab work a payer covers', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([
        buildLabItem({ testCode: 'HB', testName: 'Hemoglobin', chargeMode: 'COVERED' }),
      ]);

      await service.generateInvoice(inputPayload, cashierUser);

      expect(billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0].items).toEqual([]);
    });

    it('stamps the order onto the line it produced, so billed is a fact not a guess', async () => {
      serviceTariffRepositoryMock.findActiveConsultationTariffs.mockResolvedValue([]);
      serviceTariffRepositoryMock.findActiveTariffsByIcd9cmCodes.mockResolvedValue([]);
      billingRepositoryMock.findLabItemsForBilling.mockResolvedValue([
        buildLabItem({ testCode: 'HB', testName: 'Hemoglobin' }),
      ]);

      await service.generateInvoice(inputPayload, cashierUser);

      expect(billingRepositoryMock.createInvoiceWithItems.mock.calls[0][0].items).toEqual([
        expect.objectContaining({ itemType: 'LAB', labOrderId: 'lab-order-1' }),
      ]);
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
        service.recordPayment(
          invoiceId,
          { method: 'CASH', amount: 100000 } as RecordPaymentDto,
          cashierUser,
        ),
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
  describe('addInvoiceItem', () => {
    const unmappedTariffId = '9d2e4f60-7b8c-4c9d-a0e1-4f5a6b7c8d9e';
    const unmappedTariff = {
      ...procedureTariff,
      id: unmappedTariffId,
      code: 'TIND-JAHIT-LUKA',
      name: 'Jahit Luka Ringan',
      icd9cmCode: null,
      price: 75000,
    };
    const inputPayload = { serviceTariffId: unmappedTariffId, quantity: 2 } as AddInvoiceItemDto;

    it('attaches an active tariff with no ICD-9-CM mapping to a DRAFT invoice and audits it', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(
        invoiceWithRelationsRecord,
      );
      serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue(unmappedTariff);
      billingRepositoryMock.addInvoiceItem.mockResolvedValue({
        ...invoiceDetailRecord,
        totalAmount: invoiceDetailRecord.totalAmount + 150000,
      });

      const actualResult = await service.addInvoiceItem(invoiceId, inputPayload, cashierUser);

      expect(billingRepositoryMock.addInvoiceItem).toHaveBeenCalledWith({
        invoiceId,
        item: {
          itemType: 'PROCEDURE',
          serviceTariffId: unmappedTariffId,
          description: 'Jahit Luka Ringan',
          quantity: 2,
          unitPrice: 75000,
          amount: 150000,
        },
      });
      expect(actualResult.totalAmount).toBe(invoiceDetailRecord.totalAmount + 150000);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_ITEM_ADDED',
          resource: 'Invoice',
          resourceId: invoiceId,
          actorUserId: cashierUser.sub,
          metadata: {
            serviceTariffId: unmappedTariffId,
            tariffCode: 'TIND-JAHIT-LUKA',
            quantity: 2,
          },
        }),
      );
    });

    it('types an OTHER tariff line by its category', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(
        invoiceWithRelationsRecord,
      );
      serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
        ...unmappedTariff,
        category: 'OTHER',
      });
      billingRepositoryMock.addInvoiceItem.mockResolvedValue(invoiceDetailRecord);

      await service.addInvoiceItem(invoiceId, inputPayload, cashierUser);

      expect(billingRepositoryMock.addInvoiceItem).toHaveBeenCalledWith(
        expect.objectContaining({ item: expect.objectContaining({ itemType: 'OTHER' }) }),
      );
    });

    it('rejects an inactive tariff', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(
        invoiceWithRelationsRecord,
      );
      serviceTariffRepositoryMock.findServiceTariffById.mockResolvedValue({
        ...unmappedTariff,
        isActive: false,
      });

      await expect(
        service.addInvoiceItem(invoiceId, inputPayload, cashierUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(billingRepositoryMock.addInvoiceItem).not.toHaveBeenCalled();
    });

    it('refuses to add a line once the invoice is ISSUED', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue({
        ...invoiceWithRelationsRecord,
        status: 'ISSUED',
      });

      await expect(
        service.addInvoiceItem(invoiceId, inputPayload, cashierUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(serviceTariffRepositoryMock.findServiceTariffById).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown invoice', async () => {
      billingRepositoryMock.findInvoiceWithRelationsById.mockResolvedValue(null);

      await expect(
        service.addInvoiceItem(invoiceId, inputPayload, cashierUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeInvoiceItem', () => {
    const existingItemId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';
    const invoiceWithLine = {
      ...invoiceDetailRecord,
      items: [
        {
          id: existingItemId,
          invoiceId,
          itemType: 'PROCEDURE' as const,
          serviceTariffId: procedureTariffId,
          medicationId: null,
          description: 'Injeksi Antibiotik',
          quantity: 1,
          unitPrice: 35000,
          amount: 35000,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    };

    it('removes a line from a DRAFT invoice and audits it', async () => {
      billingRepositoryMock.findInvoiceDetailById.mockResolvedValue(invoiceWithLine);
      billingRepositoryMock.removeInvoiceItem.mockResolvedValue({
        ...invoiceDetailRecord,
        items: [],
        totalAmount: 0,
      });

      const actualResult = await service.removeInvoiceItem(invoiceId, existingItemId, cashierUser);

      expect(billingRepositoryMock.removeInvoiceItem).toHaveBeenCalledWith({
        invoiceId,
        itemId: existingItemId,
      });
      expect(actualResult.totalAmount).toBe(0);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVOICE_ITEM_REMOVED',
          resourceId: invoiceId,
          actorUserId: cashierUser.sub,
          metadata: expect.objectContaining({ itemId: existingItemId }),
        }),
      );
    });

    it('returns 404 for a line that is not on the invoice', async () => {
      billingRepositoryMock.findInvoiceDetailById.mockResolvedValue(invoiceWithLine);

      await expect(
        service.removeInvoiceItem(invoiceId, 'c0ffee00-0000-4000-8000-000000000000', cashierUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(billingRepositoryMock.removeInvoiceItem).not.toHaveBeenCalled();
    });

    it('refuses to remove a line once the invoice is PAID', async () => {
      billingRepositoryMock.findInvoiceDetailById.mockResolvedValue({
        ...invoiceWithLine,
        status: 'PAID',
      });

      await expect(
        service.removeInvoiceItem(invoiceId, existingItemId, cashierUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(billingRepositoryMock.removeInvoiceItem).not.toHaveBeenCalled();
    });
  });
});
