import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { NotificationService } from '../../notification/service/notification.service';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabResultRepository } from '../repository/lab-result.repository';
import { LabOrderMapper } from './lab-order.mapper';
import { LabReportService } from './lab-report.service';
import { LabResultMapper } from './lab-result.mapper';
import { LabResultService } from './lab-result.service';
import { LaboratorySettingsService } from './laboratory-settings.service';

/**
 * The rules that keep a typo from becoming a diagnosis: a critical value that
 * reaches the doctor before anybody has signed it, a release that refuses
 * while a test is still pending, and a second signature that has to belong to
 * a second person.
 */
describe('LabResultService', () => {
  const labOrderId = 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f';
  const labOrderItemId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const analystUser = { sub: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f', email: 'analis@hms.local' };
  const doctorUser = { sub: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', email: 'dokter@hms.local' };
  const doctorUserId = '7f8e9d0c-1b2a-4c3d-8e4f-5a6b7c8d9e0f';
  const collectedAt = new Date('2026-07-28T03:00:00.000Z');
  const dateOfBirth = new Date('1990-04-12T00:00:00.000Z');

  const labResultRepositoryMock = {
    findEntryItemsByOrderId: jest.fn(),
    enterLabResults: jest.fn(),
    releaseLabOrder: jest.fn(),
    amendLabResult: jest.fn(),
    findLabResultById: jest.fn(),
    findResultsByOrderId: jest.fn(),
    findOrderIdByResultId: jest.fn(),
    findLatestVersionForItem: jest.fn(),
    listPatientLabResults: jest.fn(),
    listEncounterLabResults: jest.fn(),
    findOrderingDoctorUserId: jest.fn(),
    hasEncounterWithPatient: jest.fn(),
    isPatientOwner: jest.fn(),
  };

  const labOrderRepositoryMock = {
    findLabOrderById: jest.fn(),
    findWorklistOrderById: jest.fn(),
  };

  const laboratorySettingsServiceMock = { getLaboratorySettings: jest.fn() };

  const authRepositoryMock = { findUserById: jest.fn() };

  const notificationServiceMock = { createForUser: jest.fn() };

  const auditServiceMock = { record: jest.fn() };

  const labReportServiceMock = { enqueueForOrder: jest.fn().mockResolvedValue(null) };

  const configServiceMock = { get: jest.fn().mockReturnValue('Asia/Jakarta') };

  const service = new LabResultService(
    labResultRepositoryMock as unknown as LabResultRepository,
    labOrderRepositoryMock as unknown as LabOrderRepository,
    laboratorySettingsServiceMock as unknown as LaboratorySettingsService,
    new LabResultMapper(),
    new LabOrderMapper(),
    authRepositoryMock as unknown as AuthRepository,
    notificationServiceMock as unknown as NotificationService,
    auditServiceMock as unknown as AuditService,
    labReportServiceMock as unknown as LabReportService,
    configServiceMock as unknown as ConfigService,
  );

  function buildOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: labOrderId,
      orderNumber: 'LAB/20260728/0001',
      encounterId: 'e1e2e3e4-5555-4555-8555-e1e2e3e4e5e6',
      patientId,
      orderedById: 'd1d2d3d4-6666-4666-8666-d1d2d3d4d5d6',
      orderedByName: 'dr. Andi Wijaya',
      status: 'COLLECTED' as const,
      priority: 'ROUTINE' as const,
      clinicalNotes: null,
      isFasting: false,
      fulfilmentSite: 'INTERNAL' as const,
      chargeMode: 'CLINIC' as const,
      externalFacilityName: null,
      recollectCount: 0,
      orderedAt: collectedAt,
      cancelledAt: null,
      cancelReason: null,
      releasedAt: null,
      items: [
        {
          id: labOrderItemId,
          labTestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          code: 'HB',
          name: 'Hemoglobin',
          specimenType: 'WHOLE_BLOOD' as const,
          resultType: 'NUMERIC' as const,
          status: 'PENDING' as const,
          panelId: null,
          panelName: null,
          specimenId: 'ffffffff-6666-4666-8666-ffffffffffff',
        },
      ],
      specimens: [],
      ...overrides,
    };
  }

  function buildWorklistOrder() {
    return {
      ...buildOrder(),
      itemCount: 1,
      orderedByLicenseNumber: null,
      patient: {
        id: patientId,
        fullName: 'Siti Rahayu',
        mrn: 'MRN00000123',
        dateOfBirth,
        sex: 'FEMALE' as const,
        bpjsNumberIndex: null,
      },
      specimens: [
        {
          id: 'ffffffff-6666-4666-8666-ffffffffffff',
          labOrderId,
          specimenType: 'WHOLE_BLOOD' as const,
          accessionNumber: 'SPC/20260728/0001',
          collectedAt,
          collectedById: analystUser.sub,
          receivedAt: null,
          status: 'COLLECTED' as const,
          rejectedAt: null,
          rejectReason: null,
          rejectNotes: null,
          notes: null,
        },
      ],
    };
  }

  function buildEntryItem(overrides: Record<string, unknown> = {}) {
    return {
      id: labOrderItemId,
      status: 'PENDING' as const,
      labTest: {
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        code: 'HB',
        name: 'Hemoglobin',
        unit: 'g/dL',
        resultType: 'NUMERIC' as const,
        codedOptions: [],
        referenceRanges: [
          {
            id: 'range-adult-female',
            sex: 'FEMALE' as const,
            ageMinDays: null,
            ageMaxDays: null,
            low: { toNumber: () => 12 },
            high: { toNumber: () => 16 },
            criticalLow: { toNumber: () => 7 },
            criticalHigh: { toNumber: () => 20 },
            textNormal: null,
          },
        ],
      },
      specimen: { collectedAt },
      results: [],
      ...overrides,
    };
  }

  function buildResult(overrides: Record<string, unknown> = {}) {
    return {
      id: '77777777-dddd-4ddd-8ddd-777777777777',
      labOrderItemId,
      version: 1,
      valueNumeric: 6.8,
      valueText: null,
      valueCoded: null,
      unit: 'g/dL',
      refLow: 12,
      refHigh: 16,
      refCriticalLow: 7,
      refCriticalHigh: 20,
      refText: null,
      flag: 'CRITICAL_LOW' as const,
      enteredById: analystUser.sub,
      enteredAt: collectedAt,
      verifiedById: null,
      verifiedAt: null,
      verifiedUnderSingleOperator: false,
      amendedFromId: null,
      amendReason: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder());
    labOrderRepositoryMock.findWorklistOrderById.mockResolvedValue(buildWorklistOrder());
    labResultRepositoryMock.findEntryItemsByOrderId.mockResolvedValue([buildEntryItem()]);
    labResultRepositoryMock.enterLabResults.mockResolvedValue([buildResult()]);
    labResultRepositoryMock.findResultsByOrderId.mockResolvedValue([buildResult()]);
    labResultRepositoryMock.findOrderingDoctorUserId.mockResolvedValue(doctorUserId);
    laboratorySettingsServiceMock.getLaboratorySettings.mockResolvedValue({
      technicianMayVerify: false,
      singleOperator: false,
      updatedById: null,
      updatedAt: null,
    });
    authRepositoryMock.findUserById.mockResolvedValue({
      roles: [{ role: { code: 'DOCTOR', name: 'Doctor', permissions: [] } }],
    });
  });

  describe('entering results', () => {
    it('snapshots the band that applied to this patient and flags the value against it', async () => {
      await service.enterLabResults(
        labOrderId,
        { items: [{ labOrderItemId, valueNumeric: 6.8 }] },
        analystUser,
      );
      expect(labResultRepositoryMock.enterLabResults).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [
            expect.objectContaining({
              labOrderItemId,
              valueNumeric: 6.8,
              unit: 'g/dL',
              refLow: 12,
              refCriticalLow: 7,
              flag: 'CRITICAL_LOW',
            }),
          ],
        }),
      );
    });

    it('notifies the ordering doctor of a critical value before anybody has verified it', async () => {
      await service.enterLabResults(
        labOrderId,
        { items: [{ labOrderItemId, valueNumeric: 6.8 }] },
        analystUser,
      );
      expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: doctorUserId, type: 'LAB_RESULT_CRITICAL' }),
      );
      expect(labResultRepositoryMock.releaseLabOrder).not.toHaveBeenCalled();
    });

    it('stays silent for a value inside the band', async () => {
      labResultRepositoryMock.enterLabResults.mockResolvedValue([
        buildResult({ valueNumeric: 13.2, flag: 'NORMAL' }),
      ]);
      await service.enterLabResults(
        labOrderId,
        { items: [{ labOrderItemId, valueNumeric: 13.2 }] },
        analystUser,
      );
      expect(notificationServiceMock.createForUser).not.toHaveBeenCalled();
    });

    it('records a value with no applicable band unflagged rather than judging it', async () => {
      labResultRepositoryMock.findEntryItemsByOrderId.mockResolvedValue([
        buildEntryItem({
          labTest: { ...buildEntryItem().labTest, referenceRanges: [] },
        }),
      ]);
      await service.enterLabResults(
        labOrderId,
        { items: [{ labOrderItemId, valueNumeric: 6.8 }] },
        analystUser,
      );
      expect(labResultRepositoryMock.enterLabResults).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [expect.objectContaining({ flag: null, refLow: null })],
        }),
      );
    });

    it('refuses prose typed into a numeric test', async () => {
      await expect(
        service.enterLabResults(
          labOrderId,
          { items: [{ labOrderItemId, valueText: 'sedikit rendah' }] },
          analystUser,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses a coded value the test does not offer', async () => {
      labResultRepositoryMock.findEntryItemsByOrderId.mockResolvedValue([
        buildEntryItem({
          labTest: {
            ...buildEntryItem().labTest,
            resultType: 'CODED',
            codedOptions: ['Negatif', 'Positif'],
          },
        }),
      ]);
      await expect(
        service.enterLabResults(
          labOrderId,
          { items: [{ labOrderItemId, valueCoded: 'Mungkin' }] },
          analystUser,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses to enter against an order another lab is running', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
        buildOrder({ fulfilmentSite: 'EXTERNAL', externalFacilityName: 'Prodia' }),
      );
      await expect(
        service.enterLabResults(
          labOrderId,
          { items: [{ labOrderItemId, valueNumeric: 6.8 }] },
          analystUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('sends a released order to amendment rather than re-entry', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder({ status: 'RELEASED' }));
      await expect(
        service.enterLabResults(
          labOrderId,
          { items: [{ labOrderItemId, valueNumeric: 6.8 }] },
          analystUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('releasing', () => {
    function buildResultedOrder() {
      const order = buildOrder({ status: 'RESULTED' });
      return { ...order, items: [{ ...order.items[0], status: 'RESULTED' as const }] };
    }

    it('refuses while a test is still waiting for a value', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder({ status: 'RESULTED' }));
      await expect(service.releaseLabOrder(labOrderId, {}, doctorUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses the person who entered the value as its second signature', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      await expect(service.releaseLabOrder(labOrderId, {}, analystUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows one operator to do both where the clinic runs single-operator', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      laboratorySettingsServiceMock.getLaboratorySettings.mockResolvedValue({
        technicianMayVerify: true,
        singleOperator: true,
        updatedById: null,
        updatedAt: null,
      });
      labResultRepositoryMock.releaseLabOrder.mockResolvedValue([
        buildResult({ verifiedById: analystUser.sub, verifiedUnderSingleOperator: true }),
      ]);
      await service.releaseLabOrder(labOrderId, {}, analystUser);
      expect(labResultRepositoryMock.releaseLabOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          verifiedById: analystUser.sub,
          verifiedUnderSingleOperator: true,
        }),
      );
    });

    it('refuses a technician where the clinic has not said they may verify', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      authRepositoryMock.findUserById.mockResolvedValue({
        roles: [{ role: { code: 'LAB_TECHNICIAN', name: 'Lab Technician', permissions: [] } }],
      });
      await expect(service.releaseLabOrder(labOrderId, {}, doctorUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses a technician whose role was renamed — codes decide, not labels', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      // What the seed actually holds: a human label that looks nothing like the
      // code. Comparing against `name` let this guard pass its own tests and
      // never once fire in production.
      authRepositoryMock.findUserById.mockResolvedValue({
        roles: [{ role: { code: 'LAB_TECHNICIAN', name: 'Analis Laboratorium', permissions: [] } }],
      });

      await expect(service.releaseLabOrder(labOrderId, {}, doctorUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets a super admin release, whatever their role is called', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      authRepositoryMock.findUserById.mockResolvedValue({
        roles: [{ role: { code: 'SUPER_ADMIN', name: 'Super Admin', permissions: [] } }],
      });

      await expect(service.releaseLabOrder(labOrderId, {}, doctorUser)).resolves.toBeDefined();
    });

    it('allows a technician where the clinic has', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      authRepositoryMock.findUserById.mockResolvedValue({
        roles: [{ role: { code: 'LAB_TECHNICIAN', name: 'Lab Technician', permissions: [] } }],
      });
      laboratorySettingsServiceMock.getLaboratorySettings.mockResolvedValue({
        technicianMayVerify: true,
        singleOperator: false,
        updatedById: null,
        updatedAt: null,
      });
      labResultRepositoryMock.releaseLabOrder.mockResolvedValue([buildResult()]);
      await service.releaseLabOrder(labOrderId, {}, doctorUser);
      expect(labResultRepositoryMock.releaseLabOrder).toHaveBeenCalled();
    });

    it('records both operators and the rule in force on the audit row', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      labResultRepositoryMock.releaseLabOrder.mockResolvedValue([buildResult()]);
      await service.releaseLabOrder(labOrderId, {}, doctorUser);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LAB_RESULT_RELEASED',
          metadata: expect.objectContaining({
            verifiedById: doctorUser.sub,
            enteredByIds: [analystUser.sub],
            singleOperator: false,
          }),
        }),
      );
    });

    it('tells the ordering doctor the report is out', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      labResultRepositoryMock.releaseLabOrder.mockResolvedValue([buildResult()]);
      await service.releaseLabOrder(labOrderId, {}, doctorUser);
      expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'LAB_RESULT_RELEASED', userId: doctorUserId }),
      );
    });

    // P18-T05: the sheet is queued by the signature and rendered later. The
    // release answers before any PDF exists.
    it('queues the report for the worker rather than rendering it here', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      labResultRepositoryMock.releaseLabOrder.mockResolvedValue([buildResult()]);
      await service.releaseLabOrder(labOrderId, {}, doctorUser);
      expect(labReportServiceMock.enqueueForOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          labOrderId,
          requestedById: doctorUser.sub,
          isAmended: false,
          note: null,
        }),
      );
    });

    // P18-T14. The verifier's sentence goes to the version this release
    // queues, not onto the order: the sheet is what it was written for.
    it('stores the verifier note against the report version it queues', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildResultedOrder());
      labResultRepositoryMock.releaseLabOrder.mockResolvedValue([buildResult()]);
      await service.releaseLabOrder(
        labOrderId,
        { note: 'Sampel lipemik, ulangi puasa 12 jam.' },
        doctorUser,
      );
      expect(labReportServiceMock.enqueueForOrder).toHaveBeenCalledWith(
        expect.objectContaining({ isAmended: false, note: 'Sampel lipemik, ulangi puasa 12 jam.' }),
      );
    });
  });

  describe('amending', () => {
    beforeEach(() => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder({ status: 'RELEASED' }));
      labResultRepositoryMock.findLabResultById.mockResolvedValue(
        buildResult({ verifiedById: doctorUser.sub, verifiedAt: collectedAt }),
      );
      labResultRepositoryMock.findOrderIdByResultId.mockResolvedValue({
        labOrderId,
        labOrderItemId,
      });
      labResultRepositoryMock.findLatestVersionForItem.mockResolvedValue(1);
      labResultRepositoryMock.amendLabResult.mockResolvedValue(
        buildResult({ id: 'amended', version: 2, valueNumeric: 8.6, flag: 'LOW' }),
      );
    });

    it('writes the correction as the next version against the original band', async () => {
      await service.amendLabResult(
        '77777777-dddd-4ddd-8ddd-777777777777',
        { valueNumeric: 8.6, reason: 'Salah ketik' },
        doctorUser,
      );
      expect(labResultRepositoryMock.amendLabResult).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 2,
          valueNumeric: 8.6,
          refLow: 12,
          refCriticalLow: 7,
          flag: 'LOW',
          amendedFromId: '77777777-dddd-4ddd-8ddd-777777777777',
          amendReason: 'Salah ketik',
          verifiedUnderSingleOperator: true,
        }),
      );
    });

    it('queues an amended report version beside the original', async () => {
      await service.amendLabResult(
        '77777777-dddd-4ddd-8ddd-777777777777',
        { valueNumeric: 8.6, reason: 'Salah ketik' },
        doctorUser,
      );
      expect(labReportServiceMock.enqueueForOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          labOrderId,
          requestedById: doctorUser.sub,
          isAmended: true,
          note: null,
        }),
      );
    });

    // P18-T14. An amendment's note is its own; the superseded version is
    // never touched, which the repository's append-only write guarantees and
    // this asserts from the service's side: nothing is passed to update.
    it('queues the amended version with its own note and leaves the earlier one alone', async () => {
      await service.amendLabResult(
        '77777777-dddd-4ddd-8ddd-777777777777',
        { valueNumeric: 8.6, reason: 'Salah ketik', note: 'Koreksi nilai Hb.' },
        doctorUser,
      );
      expect(labReportServiceMock.enqueueForOrder).toHaveBeenCalledWith(
        expect.objectContaining({ isAmended: true, note: 'Koreksi nilai Hb.' }),
      );
      expect(labReportServiceMock.enqueueForOrder).toHaveBeenCalledTimes(1);
    });

    it('refuses to fork the history by amending a superseded version', async () => {
      labResultRepositoryMock.findLatestVersionForItem.mockResolvedValue(2);
      await expect(
        service.amendLabResult(
          '77777777-dddd-4ddd-8ddd-777777777777',
          { valueNumeric: 8.6, reason: 'Salah ketik' },
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to amend a value nobody has released', async () => {
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder({ status: 'RESULTED' }));
      await expect(
        service.amendLabResult(
          '77777777-dddd-4ddd-8ddd-777777777777',
          { valueNumeric: 8.6, reason: 'Salah ketik' },
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('raises the critical bell again when the correction is itself critical', async () => {
      labResultRepositoryMock.amendLabResult.mockResolvedValue(
        buildResult({ id: 'amended', version: 2, valueNumeric: 5.1, flag: 'CRITICAL_LOW' }),
      );
      await service.amendLabResult(
        '77777777-dddd-4ddd-8ddd-777777777777',
        { valueNumeric: 5.1, reason: 'Salah ketik' },
        doctorUser,
      );
      expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'LAB_RESULT_CRITICAL' }),
      );
    });
  });

  describe('reading a patient trend', () => {
    beforeEach(() => {
      labResultRepositoryMock.listPatientLabResults.mockResolvedValue([]);
      authRepositoryMock.findUserById.mockResolvedValue({
        roles: [
          {
            role: {
              code: 'DOCTOR',
              name: 'Doctor',
              permissions: [
                { permission: { resource: 'LabOrder', action: 'read', scope: 'OWN' } },
              ],
            },
          },
        ],
      });
    });

    it('lets a doctor who attends the patient read their history', async () => {
      labResultRepositoryMock.hasEncounterWithPatient.mockResolvedValue(true);
      await expect(service.listPatientLabResults(patientId, {}, doctorUser)).resolves.toEqual([]);
    });

    it('refuses a doctor with no encounter with this patient', async () => {
      labResultRepositoryMock.hasEncounterWithPatient.mockResolvedValue(false);
      labResultRepositoryMock.isPatientOwner.mockResolvedValue(false);
      await expect(
        service.listPatientLabResults(patientId, {}, doctorUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // P18-T08. The bench view is read under the trend's rule and carries the
    // worklist identity, not the record.
    it('answers the bench with every typed value and the patient identity', async () => {
      authRepositoryMock.findUserById.mockResolvedValue({
        roles: [{ role: { permissions: [{ permission: { resource: 'LabOrder', action: 'read', scope: 'ANY' } }] } }],
      });
      labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrder({ status: 'IN_PROGRESS' }));
      labResultRepositoryMock.findResultsByOrderId.mockResolvedValue([buildResult()]);
      const actual = await service.getOrderBench(labOrderId, analystUser);
      expect(actual.patient).toEqual(expect.objectContaining({ mrn: 'MRN00000123', sex: 'FEMALE' }));
      expect(actual.results).toHaveLength(1);
      expect(actual.order.status).toBe('IN_PROGRESS');
    });

    it('lets the patient read their own', async () => {
      labResultRepositoryMock.hasEncounterWithPatient.mockResolvedValue(false);
      labResultRepositoryMock.isPatientOwner.mockResolvedValue(true);
      await expect(service.listPatientLabResults(patientId, {}, doctorUser)).resolves.toEqual([]);
    });
  });
});
