import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { DoctorManagementRepository } from '../repository/doctor-management.repository';
import { DoctorManagementService } from './doctor-management.service';

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

describe('DoctorManagementService', () => {
  const doctorManagementRepositoryMock = {
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetailById: jest.fn(),
    findDoctorByLicenseNumber: jest.fn(),
    findDoctorByOwnerUserId: jest.fn(),
    findActiveUserById: jest.fn(),
    findActivePatientsByIds: jest.fn(),
    createDoctor: jest.fn(),
    replaceDoctorSchedules: jest.fn(),
  } as unknown as DoctorManagementRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const service = new DoctorManagementService(doctorManagementRepositoryMock, authRepositoryMock);

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'admin@hms.local',
  };

  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';

  const doctorRecord = {
    id: doctorId,
    licenseNumber: 'LIC-0001',
    fullName: 'Dr. First',
    specialty: 'Cardiology',
    phoneNumber: '0812345678',
    ownerUserId: null,
    isActive: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists doctors with active patient counts', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.listDoctors as jest.Mock).mockResolvedValue({
      items: [
        {
          ...doctorRecord,
          _count: {
            patients: 3,
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.listDoctors({ page: 1, limit: 10 }, currentUser);

    expect(result.items[0]?.patientCount).toBe(3);
    expect(result.items[0]?.createdAt).toBe('2026-07-01T00:00:00.000Z');
    expect(result.meta.total).toBe(1);
  });

  it('denies listing doctors without doctor.read:any', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'ANY' }]),
    );

    await expect(service.listDoctors({ page: 1, limit: 10 }, currentUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws conflict when license number already exists', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue({
      id: 'existing-doctor',
    });

    await expect(
      service.createDoctor(
        {
          licenseNumber: 'LIC-0001',
          fullName: 'Dr. First',
          specialty: 'Cardiology',
          phoneNumber: '0812345678',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws conflict when owner user already has a doctor profile', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
      null,
    );
    (doctorManagementRepositoryMock.findActiveUserById as jest.Mock).mockResolvedValue({
      id: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
    });
    (doctorManagementRepositoryMock.findDoctorByOwnerUserId as jest.Mock).mockResolvedValue({
      id: 'existing-doctor',
    });

    await expect(
      service.createDoctor(
        {
          licenseNumber: 'LIC-0002',
          fullName: 'Dr. Second',
          specialty: 'Neurology',
          phoneNumber: '0812345679',
          ownerUserId: '7ce8961c-f8ef-4cbf-b5fc-4f7e4e301704',
          isActive: true,
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws bad request when an initial patient is missing or inactive', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
      null,
    );
    (doctorManagementRepositoryMock.findActivePatientsByIds as jest.Mock).mockResolvedValue([
      { id: '3a6d785d-f729-4af2-b415-30f96439dad0' },
    ]);

    await expect(
      service.createDoctor(
        {
          licenseNumber: 'LIC-0002',
          fullName: 'Dr. Second',
          specialty: 'Neurology',
          phoneNumber: '0812345679',
          isActive: true,
          patientIds: [
            '3a6d785d-f729-4af2-b415-30f96439dad0',
            '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
          ],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(doctorManagementRepositoryMock.createDoctor).not.toHaveBeenCalled();
  });

  it('creates a doctor with initial patient assignments atomically', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'create', resource: 'Doctor', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorByLicenseNumber as jest.Mock).mockResolvedValue(
      null,
    );
    (doctorManagementRepositoryMock.findActivePatientsByIds as jest.Mock).mockResolvedValue([
      { id: '3a6d785d-f729-4af2-b415-30f96439dad0' },
      { id: '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8' },
    ]);
    (doctorManagementRepositoryMock.createDoctor as jest.Mock).mockResolvedValue(doctorRecord);

    const result = await service.createDoctor(
      {
        licenseNumber: 'LIC-0001',
        fullName: 'Dr. First',
        specialty: 'Cardiology',
        phoneNumber: '0812345678',
        isActive: true,
        patientIds: ['3a6d785d-f729-4af2-b415-30f96439dad0', '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8'],
      },
      currentUser,
    );

    expect(doctorManagementRepositoryMock.createDoctor).toHaveBeenCalledWith(
      expect.objectContaining({
        patientIds: [
          '3a6d785d-f729-4af2-b415-30f96439dad0',
          '0b6ff86c-cb15-4d70-b7d3-f542e26a2af8',
        ],
        actorUserId: currentUser.sub,
      }),
    );
    expect(result.licenseNumber).toBe('LIC-0001');
  });

  it('rejects overlapping schedule entries on the same day', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);

    await expect(
      service.updateDoctorSchedule(
        doctorId,
        {
          schedules: [
            { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
            { dayOfWeek: 1, startTime: '11:00', endTime: '14:00', isAvailable: true },
          ],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(doctorManagementRepositoryMock.replaceDoctorSchedules).not.toHaveBeenCalled();
  });

  it('allows overlapping times on the same day when one entry is unavailable', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'ANY' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue(doctorRecord);
    (doctorManagementRepositoryMock.replaceDoctorSchedules as jest.Mock).mockResolvedValue([
      {
        id: 'b7c9a316-40b2-4f4c-9207-2a58028babc4',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '12:00',
        isAvailable: true,
      },
    ]);

    const result = await service.updateDoctorSchedule(
      doctorId,
      {
        schedules: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', isAvailable: false },
        ],
      },
      currentUser,
    );

    expect(doctorManagementRepositoryMock.replaceDoctorSchedules).toHaveBeenCalled();
    expect(result[0]?.startTime).toBe('08:00');
  });

  it('denies own-scope schedule writes for another doctor profile', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'OWN' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
      ...doctorRecord,
      ownerUserId: 'someone-else',
    });

    await expect(
      service.updateDoctorSchedule(
        doctorId,
        {
          schedules: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true }],
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows own-scope schedule writes for the own doctor profile', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'DoctorSchedule', scope: 'OWN' }]),
    );

    (doctorManagementRepositoryMock.findDoctorById as jest.Mock).mockResolvedValue({
      ...doctorRecord,
      ownerUserId: currentUser.sub,
    });
    (doctorManagementRepositoryMock.replaceDoctorSchedules as jest.Mock).mockResolvedValue([]);

    await expect(
      service.updateDoctorSchedule(
        doctorId,
        {
          schedules: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00', isAvailable: true }],
        },
        currentUser,
      ),
    ).resolves.toEqual([]);
  });

  it('includes related patients in detail only for permitted callers', async () => {
    const detailRecord = {
      ...doctorRecord,
      ownerUserId: currentUser.sub,
      _count: {
        patients: 1,
      },
      patients: [
        {
          patient: {
            id: '3a6d785d-f729-4af2-b415-30f96439dad0',
            mrn: 'MRN-0001',
            fullName: 'John Patient',
          },
        },
      ],
      schedules: [],
    };

    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([
        { action: 'read', resource: 'Doctor', scope: 'ANY' },
        { action: 'read', resource: 'Patient', scope: 'OWN' },
      ]),
    );
    (doctorManagementRepositoryMock.findDoctorDetailById as jest.Mock).mockResolvedValue(
      detailRecord,
    );

    const ownResult = await service.getDoctorById(doctorId, currentUser);

    expect(ownResult.patients).toEqual([
      { id: '3a6d785d-f729-4af2-b415-30f96439dad0', mrn: 'MRN-0001', fullName: 'John Patient' },
    ]);
    expect(ownResult.patientCount).toBe(1);

    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Doctor', scope: 'ANY' }]),
    );

    const restrictedResult = await service.getDoctorById(doctorId, currentUser);

    expect(restrictedResult.patients).toBeUndefined();
    expect(restrictedResult.patientCount).toBe(1);
  });
});
