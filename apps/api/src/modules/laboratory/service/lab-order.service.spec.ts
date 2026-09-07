import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { BillingService } from '../../billing/service/billing.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { ClinicalRequestDocumentService } from '../../clinical-request-document/service/clinical-request-document.service';
import { CreateLabOrderDto } from '../dto/create-lab-order.dto';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabCatalogService } from './lab-catalog.service';
import { LabOrderAccessService } from './lab-order-access.service';
import { LabOrderMapper } from './lab-order.mapper';
import { LabOrderService } from './lab-order.service';

/**
 * The rules that stop a patient being drawn or charged twice, and the ones that
 * keep an order traceable: panel expansion, the per-encounter duplicate check,
 * the open-visit requirement, and a cancellation that always says why.
 */
describe('LabOrderService', () => {
  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e';
  const doctorUser = { sub: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f', email: 'doctor@hms.local' };
  const labOrderId = 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f';
  const hemoglobinId = '11111111-1111-4111-8111-111111111111';
  const leukocyteId = '22222222-2222-4222-8222-222222222222';
  const glucoseId = '33333333-3333-4333-8333-333333333333';
  const darahRutinId = '44444444-4444-4444-8444-444444444444';
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const openEncounter = {
    id: encounterId,
    status: 'IN_PROGRESS' as const,
    patientId,
    doctorId,
    doctorOwnerUserId: doctorUser.sub,
    patientOwnerUserId: null,
  };

  const labOrderRepositoryMock = {
    findEncounterForOrdering: jest.fn(),
    findLiveItemsByEncounterId: jest.fn(),
    createLabOrder: jest.fn(),
    findLabOrderById: jest.fn(),
    findLabOrdersByEncounterId: jest.fn(),
    listLabOrders: jest.fn(),
    cancelLabOrder: jest.fn(),
    updateLabOrderDisposition: jest.fn(),
  };

  const labCatalogServiceMock = {
    findOrderableLabTests: jest.fn(),
    findOrderableLabPanels: jest.fn(),
  };

  const labOrderAccessServiceMock = {
    resolveScopeOrThrow: jest.fn(),
    assertCanOrderOnEncounter: jest.fn(),
    assertCanReadEncounterOrders: jest.fn(),
  };

  const auditServiceMock = { record: jest.fn() };

  const billingServiceMock = { hasIssuedInvoiceForEncounter: jest.fn() };

  const clinicProfileServiceMock = { getProfile: jest.fn() };

  const clinicalRequestDocumentServiceMock = { renderAndFile: jest.fn() };

  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };

  const service = new LabOrderService(
    labOrderRepositoryMock as unknown as LabOrderRepository,
    labCatalogServiceMock as unknown as LabCatalogService,
    labOrderAccessServiceMock as unknown as LabOrderAccessService,
    new LabOrderMapper(),
    auditServiceMock as unknown as AuditService,
    billingServiceMock as unknown as BillingService,
    clinicProfileServiceMock as unknown as ClinicProfileService,
    clinicalRequestDocumentServiceMock as unknown as ClinicalRequestDocumentService,
    configServiceMock as unknown as ConfigService,
  );

  function buildOrderRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: labOrderId,
      orderNumber: 'LAB/20260728/0001',
      encounterId,
      patientId,
      orderedById: doctorId,
      orderedByName: 'dr. Andi Wijaya',
      status: 'ORDERED' as const,
      priority: 'ROUTINE' as const,
      clinicalNotes: null,
      isFasting: false,
      fulfilmentSite: 'INTERNAL' as const,
      chargeMode: 'CLINIC' as const,
      externalFacilityName: null,
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

  beforeEach(() => {
    jest.clearAllMocks();
    labOrderAccessServiceMock.resolveScopeOrThrow.mockResolvedValue({
      hasAny: false,
      hasOwn: true,
    });
    labOrderRepositoryMock.findEncounterForOrdering.mockResolvedValue(openEncounter);
    labOrderRepositoryMock.findLiveItemsByEncounterId.mockResolvedValue([]);
    labOrderRepositoryMock.createLabOrder.mockResolvedValue(buildOrderRecord());
    labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([]);
    labCatalogServiceMock.findOrderableLabPanels.mockResolvedValue([]);
    billingServiceMock.hasIssuedInvoiceForEncounter.mockResolvedValue(false);
  });

  describe('createLabOrder', () => {
    it('expands a panel into its members and keeps the panel on every row', async () => {
      labCatalogServiceMock.findOrderableLabPanels.mockResolvedValue([
        {
          id: darahRutinId,
          members: [{ labTestId: hemoglobinId }, { labTestId: leukocyteId }],
        },
      ]);
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: glucoseId }]);

      await service.createLabOrder(
        encounterId,
        { panelIds: [darahRutinId], testIds: [glucoseId] } as CreateLabOrderDto,
        doctorUser,
      );

      expect(labOrderRepositoryMock.createLabOrder.mock.calls[0][0].items).toEqual([
        { labTestId: hemoglobinId, panelId: darahRutinId },
        { labTestId: leukocyteId, panelId: darahRutinId },
        { labTestId: glucoseId, panelId: null },
      ]);
    });

    // The clinic sold the panel. Billing prices a member through `panelId`, so
    // dropping it here would charge the loose price on top of the panel.
    it('keeps the panel when a test is named both loosely and inside one', async () => {
      labCatalogServiceMock.findOrderableLabPanels.mockResolvedValue([
        { id: darahRutinId, members: [{ labTestId: hemoglobinId }] },
      ]);
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: hemoglobinId }]);

      await service.createLabOrder(
        encounterId,
        { panelIds: [darahRutinId], testIds: [hemoglobinId] } as CreateLabOrderDto,
        doctorUser,
      );

      expect(labOrderRepositoryMock.createLabOrder.mock.calls[0][0].items).toEqual([
        { labTestId: hemoglobinId, panelId: darahRutinId },
      ]);
    });

    it('refuses to order against a visit that is no longer in progress', async () => {
      labOrderRepositoryMock.findEncounterForOrdering.mockResolvedValue({
        ...openEncounter,
        status: 'FINISHED',
      });
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: glucoseId }]);

      await expect(
        service.createLabOrder(
          encounterId,
          { testIds: [glucoseId] } as CreateLabOrderDto,
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labOrderRepositoryMock.createLabOrder).not.toHaveBeenCalled();
    });

    // Per encounter and not per order: a test ordered on a second request is a
    // second draw and a second charge, so the 409 names the order the patient
    // is already waiting on.
    it('refuses a test already live on the same visit, naming its order', async () => {
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: glucoseId }]);
      labOrderRepositoryMock.findLiveItemsByEncounterId.mockResolvedValue([
        { labTestId: glucoseId, orderNumber: 'LAB/20260728/0001' },
      ]);

      await expect(
        service.createLabOrder(
          encounterId,
          { testIds: [glucoseId] } as CreateLabOrderDto,
          doctorUser,
        ),
      ).rejects.toThrow('LAB/20260728/0001');
    });

    // The database's unique index would refuse it anyway; a readable 409 says
    // which one, instead of surfacing a constraint violation as a 500.
    it('refuses a request that lists the same test twice', async () => {
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: glucoseId }]);

      await expect(
        service.createLabOrder(
          encounterId,
          { testIds: [glucoseId, glucoseId] } as CreateLabOrderDto,
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labOrderRepositoryMock.createLabOrder).not.toHaveBeenCalled();
    });

    it('refuses an order naming a test the catalog cannot offer', async () => {
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([]);

      await expect(
        service.createLabOrder(
          encounterId,
          { testIds: [glucoseId] } as CreateLabOrderDto,
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a doctor ordering on somebody else’s encounter', async () => {
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: glucoseId }]);
      labOrderAccessServiceMock.assertCanOrderOnEncounter.mockImplementationOnce(() => {
        throw new ForbiddenException();
      });

      await expect(
        service.createLabOrder(
          encounterId,
          { testIds: [glucoseId] } as CreateLabOrderDto,
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(labOrderRepositoryMock.createLabOrder).not.toHaveBeenCalled();
    });

    it('audits the order with its number and item count', async () => {
      labCatalogServiceMock.findOrderableLabTests.mockResolvedValue([{ id: glucoseId }]);
      labOrderRepositoryMock.createLabOrder.mockResolvedValue(
        buildOrderRecord({
          items: [
            {
              id: 'item-1',
              labTestId: glucoseId,
              code: 'GDS',
              name: 'Glukosa Darah Sewaktu',
              specimenType: 'SERUM' as const,
              resultType: 'NUMERIC' as const,
              status: 'PENDING' as const,
              panelId: null,
              panelName: null,
              specimenId: null,
            },
          ],
        }),
      );

      await service.createLabOrder(
        encounterId,
        { testIds: [glucoseId] } as CreateLabOrderDto,
        doctorUser,
      );

      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_ORDER_CREATED',
          patientId,
          metadata: expect.objectContaining({ orderNumber: 'LAB/20260728/0001', itemCount: 1 }),
        }),
      );
    });
  });

  describe('cancelLabOrder', () => {
    it('withdraws an ORDERED request with its reason and audits it', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrderRecord());
      labOrderRepositoryMock.cancelLabOrder.mockResolvedValue(
        buildOrderRecord({ status: 'CANCELLED', cancelReason: 'Pasien menolak' }),
      );

      const actual = await service.cancelLabOrder(
        labOrderId,
        { reason: 'Pasien menolak' },
        doctorUser,
      );

      expect(actual.order.status).toBe('CANCELLED');
      expect(actual.meta.requiresManualCredit).toBe(false);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LAB_ORDER_CANCELLED' }),
      );
    });

    // P18-T06. The laboratory never edits an issued bill — that is corrected by
    // voiding and reissuing — so the response says a credit is owed rather than
    // leaving the patient charged for a test nobody ran.
    it('flags a manual credit when the visit has already been billed', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrderRecord());
      labOrderRepositoryMock.cancelLabOrder.mockResolvedValue(
        buildOrderRecord({ status: 'CANCELLED', cancelReason: 'Sampel tidak memadai' }),
      );
      billingServiceMock.hasIssuedInvoiceForEncounter.mockResolvedValue(true);

      const actual = await service.cancelLabOrder(
        labOrderId,
        { reason: 'Sampel tidak memadai' },
        doctorUser,
      );

      expect(actual.meta.requiresManualCredit).toBe(true);
    });

    // Once a result exists the order is history: correcting it is a
    // result-level act, not a cancellation.
    it('refuses to cancel an order that has already been resulted', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({ status: 'RESULTED' }),
      );

      await expect(
        service.cancelLabOrder(labOrderId, { reason: 'Salah input' }, doctorUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labOrderRepositoryMock.cancelLabOrder).not.toHaveBeenCalled();
    });
  });

  describe('updateDisposition', () => {
    // The decision is usually made after the doctor has finished: the patient
    // reaches the counter, hears the price, and picks the lab their insurer
    // uses. So it is its own route, and it is audited with both sides.
    it('sends an order to an outside lab and audits both sides of the change', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrderRecord());
      labOrderRepositoryMock.updateLabOrderDisposition.mockResolvedValue(
        buildOrderRecord({
          fulfilmentSite: 'EXTERNAL',
          chargeMode: 'EXTERNAL',
          externalFacilityName: 'Laboratorium Prodia Kemang',
        }),
      );

      const actual = await service.updateDisposition(
        labOrderId,
        {
          fulfilmentSite: 'EXTERNAL',
          chargeMode: 'EXTERNAL',
          externalFacilityName: 'Laboratorium Prodia Kemang',
        },
        doctorUser,
      );

      expect(actual.fulfilmentSite).toBe('EXTERNAL');
      expect(actual.externalFacilityName).toBe('Laboratorium Prodia Kemang');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_ORDER_DISPOSITION_CHANGED',
          metadata: expect.objectContaining({
            from: { fulfilmentSite: 'INTERNAL', chargeMode: 'CLINIC' },
            to: { fulfilmentSite: 'EXTERNAL', chargeMode: 'EXTERNAL' },
          }),
        }),
      );
    });

    // Once a tube exists the clinic did the work; sending it outside afterwards
    // would strand a specimen against an order nobody here is running.
    it('refuses to move an order once a specimen has been drawn', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrderRecord({ status: 'COLLECTED' }),
      );

      await expect(
        service.updateDisposition(
          labOrderId,
          {
            fulfilmentSite: 'EXTERNAL',
            chargeMode: 'EXTERNAL',
            externalFacilityName: 'Laboratorium Prodia Kemang',
          },
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(labOrderRepositoryMock.updateLabOrderDisposition).not.toHaveBeenCalled();
    });
  });

  describe('listLabOrders', () => {
    // P18-T13. The analis is holding paper with the number on it.
    it('passes the printed order number through to the query', async () => {
      labOrderRepositoryMock.listLabOrders.mockResolvedValue({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
      });

      await service.listLabOrders({ orderNumber: 'LAB/20260728/0001' } as never);

      expect(labOrderRepositoryMock.listLabOrders.mock.calls[0][0].orderNumber).toBe(
        'LAB/20260728/0001',
      );
    });
  });

  describe('findOpenOrdersForEncounter', () => {
    // Closing a visit with lab work in flight is allowed, so what the close
    // response needs is the list of what is still outstanding.
    it('reports what is still outstanding and drops released and cancelled work', async () => {
      labOrderRepositoryMock.findLabOrdersByEncounterId.mockResolvedValue([
        buildOrderRecord({ id: 'open', status: 'COLLECTED' }),
        buildOrderRecord({ id: 'done', status: 'RELEASED' }),
        buildOrderRecord({ id: 'gone', status: 'CANCELLED' }),
      ]);

      const actual = await service.findOpenOrdersForEncounter(encounterId);

      expect(actual.map((summary) => summary.status)).toEqual(['COLLECTED']);
    });
  });
});
