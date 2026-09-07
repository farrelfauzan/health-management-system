import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabSpecimenRepository } from '../repository/lab-specimen.repository';
import { LabOrderMapper } from './lab-order.mapper';
import { LabPaymentGateService } from './lab-payment-gate.service';
import { LabSpecimenService } from './lab-specimen.service';

/**
 * What the bench does to a sample, and the two rules that decide whether it can:
 * one tube per specimen type, and a rejection that puts the order back where it
 * was with the recollect visible.
 */
describe('LabSpecimenService', () => {
  const labOrderId = 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const specimenId = 'd5e6f7a8-b9c0-4d1e-8f2a-3b4c5d6e7f80';
  const analystUser = { sub: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f', email: 'analis@hms.local' };
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const labSpecimenRepositoryMock = {
    findLabSpecimenById: jest.fn(),
    collectLabSpecimens: jest.fn(),
    receiveLabSpecimen: jest.fn(),
    rejectLabSpecimen: jest.fn(),
  };

  const labOrderRepositoryMock = {
    findLabOrderById: jest.fn(),
    findWorklistOrderById: jest.fn(),
    listWorklist: jest.fn(),
  };

  const labPaymentGateServiceMock = {
    assertCollectionIsPaidFor: jest.fn(),
    findOrderIdsAwaitingPayment: jest.fn(),
  };

  const auditServiceMock = { record: jest.fn() };

  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };

  const service = new LabSpecimenService(
    labSpecimenRepositoryMock as unknown as LabSpecimenRepository,
    labOrderRepositoryMock as unknown as LabOrderRepository,
    new LabOrderMapper(),
    labPaymentGateServiceMock as unknown as LabPaymentGateService,
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  function buildItem(
    id: string,
    specimenType: 'WHOLE_BLOOD' | 'URINE',
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      labTestId: `test-${id}`,
      code: id.toUpperCase(),
      name: id,
      specimenType,
      resultType: 'NUMERIC' as const,
      status: 'PENDING' as const,
      panelId: null,
      panelName: null,
      specimenId: null,
      ...overrides,
    };
  }

  function buildOrderRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: labOrderId,
      orderNumber: 'LAB/20260728/0001',
      encounterId: 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01',
      patientId,
      orderedById: 'doctor-1',
      orderedByName: 'dr. Andi Wijaya',
      status: 'ORDERED' as const,
      priority: 'ROUTINE' as const,
      clinicalNotes: null,
      isFasting: false,
      recollectCount: 0,
      orderedAt: timestamp,
      cancelledAt: null,
      cancelReason: null,
      releasedAt: null,
      items: [],
      specimens: [],
      ...overrides,
    };
  }

  function buildSpecimenRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: specimenId,
      labOrderId,
      specimenType: 'WHOLE_BLOOD' as const,
      accessionNumber: 'SPC/20260728/0001',
      collectedAt: timestamp,
      collectedById: analystUser.sub,
      receivedAt: null,
      status: 'COLLECTED' as const,
      rejectedAt: null,
      rejectReason: null,
      rejectNotes: null,
      notes: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    labPaymentGateServiceMock.assertCollectionIsPaidFor.mockResolvedValue(undefined);
    labPaymentGateServiceMock.findOrderIdsAwaitingPayment.mockResolvedValue(new Set());
    labSpecimenRepositoryMock.collectLabSpecimens.mockResolvedValue([buildSpecimenRecord()]);
  });

  describe('collectLabSpecimens', () => {
    // One EDTA tube serves the whole darah rutin: asking the analis to say so
    // every morning is how mislabelled tubes happen.
    it('draws one tube per specimen type and links the items it serves', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({
          items: [
            buildItem('hb', 'WHOLE_BLOOD'),
            buildItem('leu', 'WHOLE_BLOOD'),
            buildItem('urin', 'URINE'),
          ],
        }),
      );

      await service.collectLabSpecimens(labOrderId, {}, analystUser);

      expect(labSpecimenRepositoryMock.collectLabSpecimens.mock.calls[0][0].specimens).toEqual([
        { specimenType: 'WHOLE_BLOOD', labOrderItemIds: ['hb', 'leu'] },
        { specimenType: 'URINE', labOrderItemIds: ['urin'] },
      ]);
    });

    // Collecting again after a partial rejection draws only what is missing.
    it('skips items that already have a live tube', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({
          status: 'COLLECTED',
          items: [
            buildItem('hb', 'WHOLE_BLOOD', { specimenId: 'existing-tube' }),
            buildItem('urin', 'URINE'),
          ],
        }),
      );

      await service.collectLabSpecimens(labOrderId, {}, analystUser);

      expect(labSpecimenRepositoryMock.collectLabSpecimens.mock.calls[0][0].specimens).toEqual([
        { specimenType: 'URINE', labOrderItemIds: ['urin'] },
      ]);
    });

    it('refuses when every test on the order already has a tube', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({
          status: 'COLLECTED',
          items: [buildItem('hb', 'WHOLE_BLOOD', { specimenId: 'existing-tube' })],
        }),
      );

      await expect(
        service.collectLabSpecimens(labOrderId, {}, analystUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labSpecimenRepositoryMock.collectLabSpecimens).not.toHaveBeenCalled();
    });

    it('refuses to collect for a cancelled order', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({ status: 'CANCELLED' }),
      );

      await expect(
        service.collectLabSpecimens(labOrderId, {}, analystUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // P18-T06: the pay-before-collect gate runs before anything is written, so
    // a refused draw leaves no accession number behind.
    it('lets the payment gate refuse before any tube is written', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({ items: [buildItem('hb', 'WHOLE_BLOOD')] }),
      );
      labPaymentGateServiceMock.assertCollectionIsPaidFor.mockRejectedValue(
        new ConflictException('LAB_PAYMENT_REQUIRED'),
      );

      await expect(
        service.collectLabSpecimens(labOrderId, {}, analystUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labSpecimenRepositoryMock.collectLabSpecimens).not.toHaveBeenCalled();
    });

    it('records when the draw actually happened, not when it was typed', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({ items: [buildItem('hb', 'WHOLE_BLOOD')] }),
      );

      await service.collectLabSpecimens(
        labOrderId,
        { collectedAt: '2026-07-28T02:15:00.000Z' },
        analystUser,
      );

      expect(labSpecimenRepositoryMock.collectLabSpecimens.mock.calls[0][0].collectedAt).toEqual(
        new Date('2026-07-28T02:15:00.000Z'),
      );
    });
  });

  describe('rejectLabSpecimen', () => {
    it('discards the tube with its reason and audits it', async () => {
      labSpecimenRepositoryMock.findLabSpecimenById.mockResolvedValue(buildSpecimenRecord());
      labSpecimenRepositoryMock.rejectLabSpecimen.mockResolvedValue(
        buildSpecimenRecord({ status: 'REJECTED', rejectReason: 'HEMOLYSED', rejectedAt: timestamp }),
      );

      const actual = await service.rejectLabSpecimen(
        specimenId,
        { reason: 'HEMOLYSED' },
        analystUser,
      );

      expect(actual.status).toBe('REJECTED');
      expect(actual.rejectReason).toBe('HEMOLYSED');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_SPECIMEN_REJECTED',
          metadata: expect.objectContaining({ reason: 'HEMOLYSED' }),
        }),
      );
    });

    it('refuses to reject a tube that is already rejected', async () => {
      labSpecimenRepositoryMock.findLabSpecimenById.mockResolvedValue(
        buildSpecimenRecord({ status: 'REJECTED' }),
      );

      await expect(
        service.rejectLabSpecimen(specimenId, { reason: 'CLOTTED' }, analystUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labSpecimenRepositoryMock.rejectLabSpecimen).not.toHaveBeenCalled();
    });
  });

  describe('listWorklist', () => {
    it('asks for the statuses behind the requested bucket', async () => {
      labOrderRepositoryMock.listWorklist.mockResolvedValue([]);

      await service.listWorklist({ bucket: 'in-progress' });

      expect(labOrderRepositoryMock.listWorklist.mock.calls[0][0].statuses).toEqual([
        'COLLECTED',
        'IN_PROGRESS',
      ]);
    });

    // The row carries identity, the order's own notes and the recollect badge —
    // and nothing else clinical.
    it('renders a row with the identity the bench needs and the recollect badge', async () => {
      labOrderRepositoryMock.listWorklist.mockResolvedValue([
        {
          ...buildOrderRecord({ recollectCount: 1, clinicalNotes: 'Curiga anemia' }),
          itemCount: 6,
          patient: {
            id: patientId,
            fullName: 'Siti Rahayu',
            mrn: 'MRN00000123',
            dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
            sex: 'FEMALE' as const,
            bpjsNumberIndex: null,
          },
        },
      ]);

      const [actual] = await service.listWorklist({ bucket: 'to-collect' });

      expect(actual).toEqual(
        expect.objectContaining({
          orderNumber: 'LAB/20260728/0001',
          recollectCount: 1,
          clinicalNotes: 'Curiga anemia',
          itemCount: 6,
          isAwaitingPayment: false,
          patient: expect.objectContaining({ mrn: 'MRN00000123', dateOfBirth: '1990-04-12' }),
        }),
      );
      expect(actual).not.toHaveProperty('subjective');
    });

    it('flags the orders the payment gate says are unsettled', async () => {
      labOrderRepositoryMock.listWorklist.mockResolvedValue([
        {
          ...buildOrderRecord(),
          itemCount: 1,
          patient: {
            id: patientId,
            fullName: 'Siti Rahayu',
            mrn: 'MRN00000123',
            dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
            sex: 'FEMALE' as const,
            bpjsNumberIndex: null,
          },
        },
      ]);
      labPaymentGateServiceMock.findOrderIdsAwaitingPayment.mockResolvedValue(
        new Set([labOrderId]),
      );

      const actual = await service.listWorklist({ bucket: 'to-collect' });

      expect(actual[0]?.isAwaitingPayment).toBe(true);
    });
  });
});
