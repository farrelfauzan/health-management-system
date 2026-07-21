import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
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
    listPrescriptions: jest.fn(),
    findActiveMedicationsByIds: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    findPrescriptionDetailById: jest.fn(),
    createPrescription: jest.fn(),
    createDispense: jest.fn(),
  } as unknown as PharmacyFlowRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const service = new PharmacyFlowService(pharmacyFlowRepositoryMock, authRepositoryMock);

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'actor@hms.local',
  };

  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7f0f4be2-6d51-4bfb-a4c8-2f6a1de1a003';
  const prescriptionId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const medicationId = '9a1f34c8-8e10-4d0e-8c31-4f6a1de1a004';
  const otherMedicationId = 'b62f10d4-2a4f-4f4e-90cf-5f6a1de1a005';

  const medicationRecord = {
    id: medicationId,
    code: 'MED-0001',
    name: 'Amoxicillin',
    form: 'capsule',
    strength: '500',
    unit: 'mg',
    stockQty: 100,
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
      },
    ],
    prescription: {
      status: 'DISPENSED',
    },
  };

  const repositoryMock = pharmacyFlowRepositoryMock as unknown as {
    listMedications: jest.Mock;
    listPrescriptions: jest.Mock;
    findActiveMedicationsByIds: jest.Mock;
    findActivePatientById: jest.Mock;
    findActiveDoctorById: jest.Mock;
    findActiveDoctorByOwnerUserId: jest.Mock;
    findActiveDoctorPatientAssignment: jest.Mock;
    findPrescriptionDetailById: jest.Mock;
    createPrescription: jest.Mock;
    createDispense: jest.Mock;
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
      });
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
      expect(repositoryMock.listPrescriptions).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        status: 'ISSUED',
        patientId: undefined,
        doctorId: undefined,
        ownerUserId: undefined,
      });
    });

    it('scopes the list to the current user with prescription.read:own permission', async () => {
      mockPermissions([{ action: 'read', resource: 'Prescription', scope: 'OWN' }]);

      await service.listPrescriptions({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listPrescriptions).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        status: undefined,
        patientId: undefined,
        doctorId: undefined,
        ownerUserId: currentUser.sub,
      });
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

    it('throws conflict when medication stock is insufficient', async () => {
      mockPermissions([{ action: 'write', resource: 'DispenseRecord', scope: 'ANY' }]);
      repositoryMock.findActiveMedicationsByIds.mockResolvedValue([
        {
          id: medicationId,
          code: 'MED-0001',
          name: 'Amoxicillin',
          stockQty: 5,
        },
      ]);

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
});
