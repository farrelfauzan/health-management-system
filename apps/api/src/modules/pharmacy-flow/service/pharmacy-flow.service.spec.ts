import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { MedicationIdentifierConflictError } from '../repository/medication-identifier-conflict.error';
import { PharmacyFlowRepository } from '../repository/pharmacy-flow.repository';
import { PharmacyFlowService } from './pharmacy-flow.service';

type PermissionScope = 'ANY' | 'OWN';

function buildActor(
  permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
): {
  roles: Array<{
    role: {
      permissions: Array<{
        permission: {
          action: string;
          resource: string;
          scope: PermissionScope;
        };
      }>;
    };
  }>;
} {
  return {
    roles: [
      {
        role: {
          permissions: permissions.map((permission) => ({
            permission,
          })),
        },
      },
    ],
  };
}

describe('PharmacyFlowService', () => {
  const pharmacyFlowRepositoryMock = {
    listMedications: jest.fn(),
    findMedicationById: jest.fn(),
    findMedicationByCode: jest.fn(),
    findMedicationByKfaCode: jest.fn(),
    createMedication: jest.fn(),
    updateMedication: jest.fn(),
    listPrescriptions: jest.fn(),
    findActiveMedicationsByIds: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    findPrescriptionDetailById: jest.fn(),
    createPrescription: jest.fn(),
    createDispense: jest.fn(),
    createStockReceipt: jest.fn(),
    listStockReceipts: jest.fn(),
    getInventorySummary: jest.fn(),
    getExpiryReport: jest.fn(),
  } as unknown as PharmacyFlowRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const service = new PharmacyFlowService(
    pharmacyFlowRepositoryMock,
    authRepositoryMock,
    { get: jest.fn().mockReturnValue('Asia/Jakarta') } as unknown as ConfigService,
  );

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'actor@hms.local',
  };

  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7f0f4be2-6d51-4bfb-a4c8-2f6a1de1a003';
  const prescriptionId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const medicationId = '9a1f34c8-8e10-4d0e-8c31-4f6a1de1a004';
  const otherMedicationId = 'b62f10d4-2a4f-4f4e-90cf-5f6a1de1a005';
  const stockReceiptId = 'a62f10d4-2a4f-4f4e-90cf-5f6a1de1a010';

  const medicationRecord = {
    id: medicationId,
    code: 'MED-0001',
    kfaCode: '93000001',
    name: 'Amoxicillin',
    form: 'capsule',
    strength: '500 mg',
    unit: 'KAPSUL',
    category: 'OBAT_KERAS',
    stockQty: 100,
    reorderLevel: 20,
    createdAt: new Date('2026-07-19T08:00:00.000Z'),
    updatedAt: new Date('2026-07-19T08:00:00.000Z'),
  };

  const prescriptionRecord = {
    id: prescriptionId,
    patientId,
    doctorId,
    status: 'ISSUED',
    issuedAt: new Date('2026-07-19T08:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-07-19T08:00:00.000Z'),
    updatedAt: new Date('2026-07-19T08:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    doctor: {
      id: doctorId,
      licenseNumber: 'LIC-0001',
      fullName: 'Doctor One',
      ownerUserId: null,
    },
    items: [
      {
        id: 'c1b2a3d4-1111-4222-8333-9f6a1de1a006',
        medicationId,
        dosage: '500 mg',
        frequency: '3x daily',
        durationDays: 5,
        quantity: 15,
        instructions: null,
        medication: {
          id: medicationId,
          code: 'MED-0001',
          name: 'Amoxicillin',
        },
        stockAllocations: [],
      },
    ],
    dispenseRecords: [],
  };

  const dispenseRecord = {
    id: 'd4e5f6a7-2222-4333-8444-af6a1de1a007',
    prescriptionId,
    pharmacistId: currentUser.sub,
    status: 'DISPENSED',
    dispensedAt: new Date('2026-07-19T09:00:00.000Z'),
    notes: null,
    createdAt: new Date('2026-07-19T09:00:00.000Z'),
    updatedAt: new Date('2026-07-19T09:00:00.000Z'),
    items: [
      {
        id: 'e5f6a7b8-3333-4444-8555-bf6a1de1a008',
        medicationId,
        quantity: 15,
        medication: {
          id: medicationId,
          code: 'MED-0001',
          name: 'Amoxicillin',
        },
        stockAllocations: [],
      },
    ],
    prescription: {
      status: 'DISPENSED',
    },
  };

  const repositoryMock = pharmacyFlowRepositoryMock as unknown as {
    listMedications: jest.Mock;
    findMedicationById: jest.Mock;
    findMedicationByCode: jest.Mock;
    findMedicationByKfaCode: jest.Mock;
    createMedication: jest.Mock;
    updateMedication: jest.Mock;
    listPrescriptions: jest.Mock;
    findActiveMedicationsByIds: jest.Mock;
    findActivePatientById: jest.Mock;
    findActiveDoctorById: jest.Mock;
    findActiveDoctorByOwnerUserId: jest.Mock;
    findActiveDoctorPatientAssignment: jest.Mock;
    findPrescriptionDetailById: jest.Mock;
    createPrescription: jest.Mock;
    createDispense: jest.Mock;
    createStockReceipt: jest.Mock;
    listStockReceipts: jest.Mock;
    getInventorySummary: jest.Mock;
    getExpiryReport: jest.Mock;
  };

  const authMock = authRepositoryMock as unknown as { findUserById: jest.Mock };

  function mockPermissions(
    permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
  ): void {
    authMock.findUserById.mockResolvedValue(buildActor(permissions));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.listMedications.mockResolvedValue({
      items: [medicationRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    repositoryMock.listPrescriptions.mockResolvedValue({
      items: [prescriptionRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    repositoryMock.findMedicationById.mockResolvedValue(medicationRecord);
    repositoryMock.findMedicationByCode.mockResolvedValue(null);
    repositoryMock.findMedicationByKfaCode.mockResolvedValue(null);
    repositoryMock.createMedication.mockResolvedValue(medicationRecord);
    repositoryMock.updateMedication.mockResolvedValue(medicationRecord);
    repositoryMock.findActiveMedicationsByIds.mockResolvedValue([
      {
        id: medicationId,
        code: 'MED-0001',
        name: 'Amoxicillin',
        stockQty: 100,
      },
    ]);
    repositoryMock.findActivePatientById.mockResolvedValue({
      id: patientId,
      ownerUserId: null,
    });
    repositoryMock.findActiveDoctorById.mockResolvedValue({
      id: doctorId,
      ownerUserId: null,
    });
    repositoryMock.findActiveDoctorByOwnerUserId.mockResolvedValue({
      id: doctorId,
      ownerUserId: currentUser.sub,
    });
    repositoryMock.findActiveDoctorPatientAssignment.mockResolvedValue({
      id: 'assignment-1',
    });
    repositoryMock.findPrescriptionDetailById.mockResolvedValue(prescriptionRecord);
    repositoryMock.createPrescription.mockResolvedValue(prescriptionRecord);
    repositoryMock.createDispense.mockResolvedValue(dispenseRecord);
    repositoryMock.createStockReceipt.mockResolvedValue({
      id: stockReceiptId,
      medicationId,
      batchNumber: 'LOT-01',
      expiryDate: new Date('2028-01-31T00:00:00.000Z'),
      quantity: 100,
      remainingQuantity: 85,
      receivedAt: new Date('2026-07-19T08:00:00.000Z'),
      receivedById: currentUser.sub,
      notes: null,
      createdAt: new Date('2026-07-19T08:00:00.000Z'),
      medication: { id: medicationId, code: 'MED-0001', name: 'Amoxicillin' },
      allocations: [{ quantity: 15 }],
    });
    repositoryMock.listStockReceipts.mockResolvedValue({
      items: [], total: 0, page: 1, limit: 10,
    });
    repositoryMock.getInventorySummary.mockResolvedValue([
      {
        medicationId,
        medicationCode: 'MED-0001',
        medicationName: 'Amoxicillin',
        stockQty: 15,
        reorderLevel: 20,
        nearestExpiryDate: new Date('2028-01-31T00:00:00.000Z'),
        unknownExpiryQty: 0,
      },
    ]);
    repositoryMock.getExpiryReport.mockResolvedValue([]);
  });

  describe('listMedications', () => {
    it('throws forbidden when actor lacks medication.read:any permission', async () => {
      mockPermissions([]);

      await expect(
        service.listMedications({ page: 1, limit: 10 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns paginated medications with medication.read:any permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const actualResult = await service.listMedications(
        { page: 1, limit: 10, search: 'amox' },
        currentUser,
      );

      expect(actualResult.items).toHaveLength(1);
      expect(actualResult.meta.total).toBe(1);
      expect(repositoryMock.listMedications).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: 'amox',
        category: undefined,
        reorderOnly: undefined,
        inventoryDate: expect.any(Date),
      });
    });

    it('forwards the category filter to the repository', async () => {
      mockPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      await service.listMedications({ page: 1, limit: 10, category: 'OBAT_KERAS' }, currentUser);

      expect(repositoryMock.listMedications).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: undefined,
        category: 'OBAT_KERAS',
        reorderOnly: undefined,
        inventoryDate: expect.any(Date),
      });
    });

    it('maps the catalog fields onto the medication response', async () => {
      mockPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      const actualResult = await service.listMedications({ page: 1, limit: 10 }, currentUser);

      expect(actualResult.items[0]).toMatchObject({
        kfaCode: '93000001',
        unit: 'KAPSUL',
        category: 'OBAT_KERAS',
      });
    });
  });

  describe('createMedication', () => {
    const createInput = {
      code: 'MED-0001',
      kfaCode: '93000001',
      name: 'Amoxicillin',
      form: 'capsule',
      strength: '500 mg',
      unit: 'KAPSUL' as const,
      category: 'OBAT_KERAS' as const,
      reorderLevel: 20,
    };

    it('throws forbidden when actor lacks medication.create:any permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      await expect(service.createMedication(createInput, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('creates a medication with medication.create:any permission', async () => {
      mockPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);

      const actualResult = await service.createMedication(createInput, currentUser);

      expect(repositoryMock.createMedication).toHaveBeenCalledWith(createInput);
      expect(actualResult.code).toBe('MED-0001');
      expect(actualResult.kfaCode).toBe('93000001');
    });

    it('rejects a duplicate catalog code', async () => {
      mockPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);
      repositoryMock.findMedicationByCode.mockResolvedValue({ id: otherMedicationId });

      await expect(service.createMedication(createInput, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositoryMock.createMedication).not.toHaveBeenCalled();
    });

    it('rejects a duplicate KFA code', async () => {
      mockPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);
      repositoryMock.findMedicationByKfaCode.mockResolvedValue({ id: otherMedicationId });

      await expect(service.createMedication(createInput, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositoryMock.createMedication).not.toHaveBeenCalled();
    });

    it('maps a repository uniqueness race onto a conflict', async () => {
      mockPermissions([{ action: 'create', resource: 'Medication', scope: 'ANY' }]);
      repositoryMock.createMedication.mockRejectedValue(
        new MedicationIdentifierConflictError('kfaCode'),
      );

      await expect(service.createMedication(createInput, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('updateMedication', () => {
    it('throws forbidden when actor lacks medication.update:any permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      await expect(
        service.updateMedication(medicationId, { reorderLevel: 50 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws not found when the medication does not exist', async () => {
      mockPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);
      repositoryMock.findMedicationById.mockResolvedValue(null);

      await expect(
        service.updateMedication(medicationId, { reorderLevel: 50 }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates a medication with medication.update:any permission', async () => {
      mockPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);

      const actualResult = await service.updateMedication(
        medicationId,
        { category: 'OBAT_BEBAS', reorderLevel: 50 },
        currentUser,
      );

      expect(repositoryMock.updateMedication).toHaveBeenCalledWith(medicationId, {
        category: 'OBAT_BEBAS',
        reorderLevel: 50,
      }, expect.any(Date));
      expect(actualResult.id).toBe(medicationId);
    });

    it('skips the uniqueness pre-check when the codes are unchanged', async () => {
      mockPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);

      await service.updateMedication(
        medicationId,
        { code: 'MED-0001', kfaCode: '93000001' },
        currentUser,
      );

      expect(repositoryMock.findMedicationByCode).not.toHaveBeenCalled();
      expect(repositoryMock.findMedicationByKfaCode).not.toHaveBeenCalled();
    });

    it('rejects a KFA code already used by another medication', async () => {
      mockPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);
      repositoryMock.findMedicationByKfaCode.mockResolvedValue({ id: otherMedicationId });

      await expect(
        service.updateMedication(medicationId, { kfaCode: '93000002' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repositoryMock.updateMedication).not.toHaveBeenCalled();
    });

    it('clears the KFA code when it is explicitly nulled', async () => {
      mockPermissions([{ action: 'update', resource: 'Medication', scope: 'ANY' }]);

      await service.updateMedication(medicationId, { kfaCode: null }, currentUser);

      expect(repositoryMock.findMedicationByKfaCode).not.toHaveBeenCalled();
      expect(repositoryMock.updateMedication).toHaveBeenCalledWith(medicationId, {
        kfaCode: null,
      }, expect.any(Date));
    });
  });

  describe('listPrescriptions', () => {
    it('throws forbidden when actor lacks prescription.read permission', async () => {
      mockPermissions([]);

      await expect(
        service.listPrescriptions({ page: 1, limit: 10 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns unscoped paginated prescriptions with prescription.read:any permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Prescription', scope: 'ANY' }]);

      const actualResult = await service.listPrescriptions(
        { page: 1, limit: 10, status: 'ISSUED' },
        currentUser,
      );

      expect(actualResult.items).toHaveLength(1);
      expect(actualResult.meta.total).toBe(1);
      expect(repositoryMock.listPrescriptions).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10, status: 'ISSUED' }),
        { userId: currentUser.sub, scope: 'ANY' },
      );
    });

    it('scopes the list to the current user with prescription.read:own permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Prescription', scope: 'OWN' }]);

      await service.listPrescriptions({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listPrescriptions).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10 }),
        { userId: currentUser.sub, scope: 'OWN' },
      );
    });
  });

  describe('createPrescription', () => {
    const createPayload = {
      patientId,
      doctorId,
      items: [
        {
          medicationId,
          dosage: '500 mg',
          frequency: '3x daily',
          quantity: 15,
        },
      ],
    };

    it('throws forbidden when actor lacks prescription.write permission', async () => {
      mockPermissions([]);

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws bad request for write:any scope when doctorId is missing', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      await expect(
        service.createPrescription({ ...createPayload, doctorId: undefined }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request when doctor is missing or inactive', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue(null);

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws bad request when patient is missing or inactive', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);
      repositoryMock.findActivePatientById.mockResolvedValue(null);

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws bad request when a medication does not exist', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);
      repositoryMock.findActiveMedicationsByIds.mockResolvedValue([]);

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws forbidden for write:own scope when actor has no doctor profile', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'OWN' }]);
      repositoryMock.findActiveDoctorByOwnerUserId.mockResolvedValue(null);

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws forbidden for write:own scope when doctorId targets another doctor', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'OWN' }]);
      repositoryMock.findActiveDoctorByOwnerUserId.mockResolvedValue({
        id: 'another-doctor',
        ownerUserId: currentUser.sub,
      });

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws forbidden for write:own scope when patient is not actively assigned', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'OWN' }]);
      repositoryMock.findActiveDoctorPatientAssignment.mockResolvedValue(null);

      await expect(service.createPrescription(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('creates a prescription for write:own scope with an active assignment', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'OWN' }]);

      const actualPrescription = await service.createPrescription(
        { ...createPayload, doctorId: undefined },
        currentUser,
      );

      expect(actualPrescription.id).toBe(prescriptionId);
      expect(repositoryMock.findActiveDoctorPatientAssignment).toHaveBeenCalledWith(
        doctorId,
        patientId,
      );
      expect(repositoryMock.createPrescription).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId, patientId }),
      );
    });

    it('creates a prescription for write:any scope without assignment checks', async () => {
      mockPermissions([{ action: 'write', resource: 'Prescription', scope: 'ANY' }]);

      await service.createPrescription(createPayload, currentUser);

      expect(repositoryMock.findActiveDoctorPatientAssignment).not.toHaveBeenCalled();
      expect(repositoryMock.createPrescription).toHaveBeenCalledWith({
        patientId,
        doctorId,
        notes: undefined,
        items: createPayload.items,
      });
    });
  });

  describe('createDispense', () => {
    const dispensePayload = {
      prescriptionId,
      items: [
        {
          medicationId,
          quantity: 15,
        },
      ],
    };

    it('throws forbidden when actor lacks dispense.write:any permission', async () => {
      mockPermissions([]);

      await expect(service.createDispense(dispensePayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws forbidden when actor only has an own-scoped dispense permission', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'OWN' }]);

      await expect(service.createDispense(dispensePayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws not found when prescription does not exist', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      repositoryMock.findPrescriptionDetailById.mockResolvedValue(null);

      await expect(service.createDispense(dispensePayload, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each(['DRAFT', 'DISPENSED', 'CANCELLED'])(
      'throws conflict when prescription status is %s',
      async (status) => {
        mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
        repositoryMock.findPrescriptionDetailById.mockResolvedValue({
          ...prescriptionRecord,
          status,
        });

        await expect(service.createDispense(dispensePayload, currentUser)).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it('throws bad request when a dispense item is not on the prescription', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);

      await expect(
        service.createDispense(
          {
            prescriptionId,
            items: [{ medicationId: otherMedicationId, quantity: 1 }],
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws conflict when quantity exceeds the remaining prescribed quantity', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      repositoryMock.findPrescriptionDetailById.mockResolvedValue({
        ...prescriptionRecord,
        status: 'PARTIALLY_DISPENSED',
        dispenseRecords: [
          {
            id: 'previous-dispense',
            status: 'DISPENSED',
            items: [{ medicationId, quantity: 10 }],
          },
        ],
      });

      await expect(
        service.createDispense(
          {
            prescriptionId,
            items: [{ medicationId, quantity: 6 }],
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates transactional insufficient-stock conflicts', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      repositoryMock.createDispense.mockRejectedValue(
        new ConflictException('Insufficient medication stock'),
      );

      await expect(service.createDispense(dispensePayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('creates a dispense record attributed to the current pharmacist', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);

      const actualDispense = await service.createDispense(dispensePayload, currentUser);

      expect(actualDispense.id).toBe(dispenseRecord.id);
      expect(actualDispense.prescriptionStatus).toBe('DISPENSED');
      expect(repositoryMock.createDispense).toHaveBeenCalledWith({
        prescriptionId,
        pharmacistId: currentUser.sub,
        notes: undefined,
        items: dispensePayload.items,
        inventoryDate: expect.any(Date),
      });
    });

    it('allows a partial dispense within the remaining quantity', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      repositoryMock.findPrescriptionDetailById.mockResolvedValue({
        ...prescriptionRecord,
        status: 'PARTIALLY_DISPENSED',
        dispenseRecords: [
          {
            id: 'previous-dispense',
            status: 'DISPENSED',
            items: [{ medicationId, quantity: 10 }],
          },
        ],
      });

      await service.createDispense(
        {
          prescriptionId,
          items: [{ medicationId, quantity: 5 }],
        },
        currentUser,
      );

      expect(repositoryMock.createDispense).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ medicationId, quantity: 5 }],
        }),
      );
    });
  });

  describe('inventory', () => {
    it('keeps inventory reads behind the dedicated permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Medication', scope: 'ANY' }]);

      await expect(service.getInventorySummary(currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('creates a receipt and maps its remaining quantity', async () => {
      mockPermissions([{ action: 'write', resource: 'Inventory', scope: 'ANY' }]);

      const result = await service.createStockReceipt(
        {
          medicationId,
          batchNumber: 'LOT-01',
          expiryDate: '2028-01-31',
          quantity: 100,
        },
        currentUser,
      );

      expect(result).toMatchObject({ allocatedQty: 15, remainingQty: 85 });
      expect(repositoryMock.createStockReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ receivedById: currentUser.sub, quantity: 100 }),
      );
    });

    it('marks a receipt-derived balance at its reorder level', async () => {
      mockPermissions([{ action: 'read', resource: 'Inventory', scope: 'ANY' }]);

      const result = await service.getInventorySummary(currentUser);

      expect(result.reorderCount).toBe(1);
      expect(result.items[0]).toMatchObject({ stockQty: 15, needsReorder: true });
      expect(repositoryMock.getInventorySummary).toHaveBeenCalledWith(expect.any(Date));
    });
  });
});
