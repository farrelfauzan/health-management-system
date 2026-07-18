import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { DoctorPatientRepository } from '../repository/doctor-patient.repository';
import { DoctorPatientService } from './doctor-patient.service';

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

describe('DoctorPatientService', () => {
  const doctorPatientRepositoryMock = {
    findActiveDoctorById: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveAssignment: jest.fn(),
    findAssignmentById: jest.fn(),
    createAssignment: jest.fn(),
    unassignAssignment: jest.fn(),
    listActivities: jest.fn(),
  } as unknown as DoctorPatientRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const service = new DoctorPatientService(doctorPatientRepositoryMock, authRepositoryMock);

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'admin@hms.local',
  };

  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const patientId = '3a6d785d-f729-4af2-b415-30f96439dad0';

  const activeAssignment = {
    id: '9c1a9c60-24a5-45ff-bc70-1a2f9d76a2f6',
    doctorId,
    patientId,
    assignedById: currentUser.sub,
    assignedAt: new Date('2026-07-01T00:00:00.000Z'),
    unassignedById: null,
    unassignedAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies assignment without doctor-patient.assign:any permission', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'Patient', scope: 'ANY' }]),
    );

    await expect(
      service.assignDoctorToPatient({ doctorId, patientId }, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(doctorPatientRepositoryMock.createAssignment).not.toHaveBeenCalled();
  });

  it('throws bad request when doctor is missing or inactive', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.findActiveDoctorById as jest.Mock).mockResolvedValue(null);

    await expect(
      service.assignDoctorToPatient({ doctorId, patientId }, currentUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a new assignment with an ASSIGNED activity actor', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.findActiveDoctorById as jest.Mock).mockResolvedValue({
      id: doctorId,
    });
    (doctorPatientRepositoryMock.findActivePatientById as jest.Mock).mockResolvedValue({
      id: patientId,
    });
    (doctorPatientRepositoryMock.findActiveAssignment as jest.Mock).mockResolvedValue(null);
    (doctorPatientRepositoryMock.createAssignment as jest.Mock).mockResolvedValue(
      activeAssignment,
    );

    const result = await service.assignDoctorToPatient({ doctorId, patientId }, currentUser);

    expect(doctorPatientRepositoryMock.createAssignment).toHaveBeenCalledWith({
      doctorId,
      patientId,
      actorUserId: currentUser.sub,
    });
    expect(result.created).toBe(true);
    expect(result.assignment.assignedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(result.assignment.unassignedAt).toBeUndefined();
  });

  it('returns the existing active assignment idempotently', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.findActiveDoctorById as jest.Mock).mockResolvedValue({
      id: doctorId,
    });
    (doctorPatientRepositoryMock.findActivePatientById as jest.Mock).mockResolvedValue({
      id: patientId,
    });
    (doctorPatientRepositoryMock.findActiveAssignment as jest.Mock).mockResolvedValue(
      activeAssignment,
    );

    const result = await service.assignDoctorToPatient({ doctorId, patientId }, currentUser);

    expect(result.created).toBe(false);
    expect(result.assignment.id).toBe(activeAssignment.id);
    expect(doctorPatientRepositoryMock.createAssignment).not.toHaveBeenCalled();
  });

  it('throws not found when unassigning an unknown assignment', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'unassign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.findAssignmentById as jest.Mock).mockResolvedValue(null);

    await expect(
      service.unassignDoctorFromPatient(activeAssignment.id, currentUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps unassignment idempotent for already unassigned rows', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'unassign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.findAssignmentById as jest.Mock).mockResolvedValue({
      ...activeAssignment,
      unassignedById: currentUser.sub,
      unassignedAt: new Date('2026-07-10T00:00:00.000Z'),
    });

    const result = await service.unassignDoctorFromPatient(activeAssignment.id, currentUser);

    expect(result.unassigned).toBe(false);
    expect(result.assignment.unassignedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(doctorPatientRepositoryMock.unassignAssignment).not.toHaveBeenCalled();
  });

  it('unassigns an active assignment with actor and timestamp', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'unassign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.findAssignmentById as jest.Mock).mockResolvedValue(
      activeAssignment,
    );
    (doctorPatientRepositoryMock.unassignAssignment as jest.Mock).mockResolvedValue({
      ...activeAssignment,
      unassignedById: currentUser.sub,
      unassignedAt: new Date('2026-07-15T00:00:00.000Z'),
    });

    const result = await service.unassignDoctorFromPatient(activeAssignment.id, currentUser);

    expect(doctorPatientRepositoryMock.unassignAssignment).toHaveBeenCalledWith({
      assignmentId: activeAssignment.id,
      actorUserId: currentUser.sub,
    });
    expect(result.unassigned).toBe(true);
    expect(result.assignment.unassignedById).toBe(currentUser.sub);
  });

  it('denies activity reads without doctor-patient.activity.read:any permission', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'assign', resource: 'DoctorPatient', scope: 'ANY' }]),
    );

    await expect(
      service.listActivity({ page: 1, limit: 10 }, currentUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(doctorPatientRepositoryMock.listActivities).not.toHaveBeenCalled();
  });

  it('lists activity events with filters and pagination meta', async () => {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'read', resource: 'DoctorPatientActivity', scope: 'ANY' }]),
    );

    (doctorPatientRepositoryMock.listActivities as jest.Mock).mockResolvedValue({
      items: [
        {
          id: '0d8b0b7e-6c9d-4b5a-9be0-0f2fdd6d6a11',
          assignmentId: activeAssignment.id,
          action: 'ASSIGNED',
          actorUserId: currentUser.sub,
          occurredAt: new Date('2026-07-01T00:00:00.000Z'),
          assignment: {
            doctorId,
            patientId,
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.listActivity(
      {
        page: 1,
        limit: 10,
        doctorId,
        action: 'ASSIGNED',
        occurredFrom: '2026-07-01T00:00:00.000Z',
      },
      currentUser,
    );

    expect(doctorPatientRepositoryMock.listActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId,
        action: 'ASSIGNED',
        occurredFrom: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );
    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toEqual({
      id: '0d8b0b7e-6c9d-4b5a-9be0-0f2fdd6d6a11',
      assignmentId: activeAssignment.id,
      doctorId,
      patientId,
      action: 'ASSIGNED',
      actorUserId: currentUser.sub,
      occurredAt: '2026-07-01T00:00:00.000Z',
    });
  });
});
