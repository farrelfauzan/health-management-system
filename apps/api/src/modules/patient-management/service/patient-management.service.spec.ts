import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { PatientManagementRepository } from '../repository/patient-management.repository';
import { PatientManagementService } from './patient-management.service';

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

describe('PatientManagementService', () => {
  const patientManagementRepositoryMock = {
    listPatients: jest.fn(),
    findPatientById: jest.fn(),
    findPatientByMrn: jest.fn(),
    findActiveUserById: jest.fn(),
    createPatient: jest.fn(),
    updatePatient: jest.fn(),
  } as unknown as PatientManagementRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const service = new PatientManagementService(patientManagementRepositoryMock, authRepositoryMock);

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'patient@hms.local',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists patients with any-scope permission', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.listPatients as jest.Mock).mockResolvedValue({
      items: [
        {
          id: '3a6d785d-f729-4af2-b415-30f96439dad0',
          mrn: 'MRN-0001',
          fullName: 'John Patient',
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          phoneNumber: '12345',
          address: 'Main Street',
          ownerUserId: currentUser.sub,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.listPatients({ page: 1, limit: 10 }, currentUser);

    expect(patientManagementRepositoryMock.listPatients).toHaveBeenCalledWith(
      { page: 1, limit: 10 },
      currentUser,
      true,
    );
    expect(result.meta.total).toBe(1);
    expect(result.items[0]?.dateOfBirth).toBe('1990-01-01');
  });

  it('denies reading patient detail when only own scope and patient is not owned', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await expect(
      service.getPatientById('3a6d785d-f729-4af2-b415-30f96439dad0', currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws conflict when MRN already exists', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue({
      id: 'existing-id',
    });

    await expect(
      service.createPatient(
        {
          mrn: 'MRN-0001',
          fullName: 'John Patient',
          dateOfBirth: '1990-01-01',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('denies own-scope update when attempting owner reassignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'update', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: currentUser.sub,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await expect(
      service.updatePatient(
        '3a6d785d-f729-4af2-b415-30f96439dad0',
        {
          ownerUserId: 'ec7602c6-e489-4d0f-a8a7-b0f91a5bfbe2',
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws bad request when date value is invalid', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);

    await expect(
      service.createPatient(
        {
          mrn: 'MRN-0002',
          fullName: 'Jane Patient',
          dateOfBirth: '1990-13-01',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
