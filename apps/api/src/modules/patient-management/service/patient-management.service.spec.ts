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
    findPatientDetailById: jest.fn(),
    findPatientByMrn: jest.fn(),
    findActiveUserById: jest.fn(),
    findActiveDoctorsByIds: jest.fn(),
    hasActiveAssignmentWithDoctorUser: jest.fn(),
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
          sex: 'MALE',
          status: 'IN_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          ownerUserId: currentUser.sub,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          _count: {
            doctors: 2,
          },
          doctors: [
            {
              id: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
              doctor: {
                id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
                fullName: 'Dr. Assigned',
                specialty: { name: 'Cardiology' },
              },
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.listPatients(
      { page: 1, limit: 10, status: 'IN_PATIENT', createdFrom: '2026-01-01' },
      currentUser,
    );

    expect(patientManagementRepositoryMock.listPatients).toHaveBeenCalledWith(
      {
        page: 1,
        limit: 10,
        status: 'IN_PATIENT',
        createdFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      currentUser,
      true,
    );
    expect(result.meta.total).toBe(1);
    expect(result.items[0]?.dateOfBirth).toBe('1990-01-01');
    expect(result.items[0]?.sex).toBe('MALE');
    expect(result.items[0]?.status).toBe('IN_PATIENT');
    expect(result.items[0]?.doctorCount).toBe(2);
    expect(result.items[0]?.doctors).toEqual([
      {
        id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
        assignmentId: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
        fullName: 'Dr. Assigned',
        specialty: 'Cardiology',
      },
    ]);
  });

  it('denies reading patient detail when only own scope and no ownership or active assignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientDetailById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      doctors: [],
    });
    (
      patientManagementRepositoryMock.hasActiveAssignmentWithDoctorUser as jest.Mock
    ).mockResolvedValue(false);

    await expect(
      service.getPatientById('3a6d785d-f729-4af2-b415-30f96439dad0', currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows own-scope doctor to read patient detail through an active assignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'OWN' }]),
    );

    (patientManagementRepositoryMock.findPatientDetailById as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0001',
      fullName: 'John Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'MALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      doctors: [
        {
          id: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
          doctor: {
            id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
            fullName: 'Dr. Assigned',
            specialty: { name: 'Cardiology' },
          },
        },
      ],
    });
    (
      patientManagementRepositoryMock.hasActiveAssignmentWithDoctorUser as jest.Mock
    ).mockResolvedValue(true);

    const result = await service.getPatientById(
      '3a6d785d-f729-4af2-b415-30f96439dad0',
      currentUser,
    );

    expect(
      patientManagementRepositoryMock.hasActiveAssignmentWithDoctorUser,
    ).toHaveBeenCalledWith('3a6d785d-f729-4af2-b415-30f96439dad0', currentUser.sub);
    expect(result.doctors).toEqual([
      {
        id: '58e9a316-40b2-4f4c-9207-2a58028babc4',
        assignmentId: '9d2f9c7a-58a4-4a0f-9a52-b6dfae13b105',
        fullName: 'Dr. Assigned',
        specialty: 'Cardiology',
      },
    ]);
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
          sex: 'MALE',
          status: 'OUT_PATIENT',
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
      sex: 'MALE',
      status: 'OUT_PATIENT',
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

  it('throws bad request when an initial doctor is missing or inactive', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);
    (patientManagementRepositoryMock.findActiveDoctorsByIds as jest.Mock).mockResolvedValue([
      { id: '58e9a316-40b2-4f4c-9207-2a58028babc4' },
    ]);

    await expect(
      service.createPatient(
        {
          mrn: 'MRN-0003',
          fullName: 'Jane Patient',
          dateOfBirth: '1990-01-01',
          sex: 'FEMALE',
          status: 'OUT_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
          doctorIds: [
            '58e9a316-40b2-4f4c-9207-2a58028babc4',
            '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
          ],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(patientManagementRepositoryMock.createPatient).not.toHaveBeenCalled();
  });

  it('creates a patient with initial doctor assignments atomically', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Patient', scope: 'ANY' }]),
    );

    (patientManagementRepositoryMock.findPatientByMrn as jest.Mock).mockResolvedValue(null);
    (patientManagementRepositoryMock.findActiveDoctorsByIds as jest.Mock).mockResolvedValue([
      { id: '58e9a316-40b2-4f4c-9207-2a58028babc4' },
      { id: '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8' },
    ]);
    (patientManagementRepositoryMock.createPatient as jest.Mock).mockResolvedValue({
      id: '3a6d785d-f729-4af2-b415-30f96439dad0',
      mrn: 'MRN-0003',
      fullName: 'Jane Patient',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '12345',
      address: 'Main Street',
      ownerUserId: null,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    const result = await service.createPatient(
      {
        mrn: 'MRN-0003',
        fullName: 'Jane Patient',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
        status: 'OUT_PATIENT',
        phoneNumber: '12345',
        address: 'Main Street',
        isActive: true,
        doctorIds: ['58e9a316-40b2-4f4c-9207-2a58028babc4', '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8'],
      },
      currentUser,
    );

    expect(patientManagementRepositoryMock.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorIds: [
          '58e9a316-40b2-4f4c-9207-2a58028babc4',
          '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
        ],
        actorUserId: currentUser.sub,
      }),
    );
    expect(result.mrn).toBe('MRN-0003');
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
          sex: 'FEMALE',
          status: 'OUT_PATIENT',
          phoneNumber: '12345',
          address: 'Main Street',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
