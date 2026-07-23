import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { AppointmentManagementRepository } from '../repository/appointment-management.repository';
import { AppointmentManagementService } from './appointment-management.service';

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

describe('AppointmentManagementService', () => {
  const appointmentManagementRepositoryMock = {
    listAppointments: jest.fn(),
    findAppointmentDetailById: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findConflictingAppointment: jest.fn(),
    createAppointment: jest.fn(),
    updateAppointment: jest.fn(),
    cancelAppointment: jest.fn(),
  } as unknown as AppointmentManagementRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const configServiceMock = {
    get: jest.fn().mockReturnValue('Asia/Jakarta'),
  } as unknown as ConfigService;

  const service = new AppointmentManagementService(
    appointmentManagementRepositoryMock,
    authRepositoryMock,
    configServiceMock,
  );

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'admin@hms.local',
  };

  const appointmentId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const futureMondayNineUtc = '2027-01-04T09:00:00.000Z';

  const appointmentRecord = {
    id: appointmentId,
    patientId,
    doctorId,
    scheduledAt: new Date(futureMondayNineUtc),
    status: 'SCHEDULED',
    reason: 'Routine check',
    notes: null,
    createdById: currentUser.sub,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    doctor: {
      id: doctorId,
      fullName: 'Dr. First',
      specialty: 'Cardiology',
      ownerUserId: null,
    },
  };

  const repositoryMock = appointmentManagementRepositoryMock as unknown as {
    listAppointments: jest.Mock;
    findAppointmentDetailById: jest.Mock;
    findActivePatientById: jest.Mock;
    findActiveDoctorById: jest.Mock;
    findConflictingAppointment: jest.Mock;
    createAppointment: jest.Mock;
    updateAppointment: jest.Mock;
    cancelAppointment: jest.Mock;
  };

  const authMock = authRepositoryMock as unknown as { findUserById: jest.Mock };

  function mockPermissions(
    permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
  ): void {
    authMock.findUserById.mockResolvedValue(buildActor(permissions));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.listAppointments.mockResolvedValue({
      items: [appointmentRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    repositoryMock.findAppointmentDetailById.mockResolvedValue(appointmentRecord);
    repositoryMock.findActivePatientById.mockResolvedValue({
      id: patientId,
      ownerUserId: null,
    });
    repositoryMock.findActiveDoctorById.mockResolvedValue({
      id: doctorId,
      ownerUserId: null,
      schedules: [],
    });
    repositoryMock.findConflictingAppointment.mockResolvedValue(null);
    repositoryMock.createAppointment.mockResolvedValue(appointmentRecord);
    repositoryMock.updateAppointment.mockResolvedValue(appointmentRecord);
    repositoryMock.cancelAppointment.mockResolvedValue({
      ...appointmentRecord,
      status: 'CANCELLED',
    });
  });

  describe('listAppointments', () => {
    it('throws forbidden when actor lacks appointment.read permission', async () => {
      mockPermissions([]);

      await expect(
        service.listAppointments({ page: 1, limit: 10 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not constrain ownership for read:any scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'ANY' }]);

      await service.listAppointments({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listAppointments).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: undefined }),
      );
    });

    it('constrains ownership to current user for read:own scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'OWN' }]);

      await service.listAppointments({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listAppointments).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: currentUser.sub }),
      );
    });
  });

  describe('getAppointmentById', () => {
    it('throws not found when appointment does not exist', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue(null);

      await expect(service.getAppointmentById(appointmentId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws forbidden for read:own scope when actor is not a participant', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'OWN' }]);

      await expect(service.getAppointmentById(appointmentId, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns appointment for read:own scope when actor owns the patient profile', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        patient: { ...appointmentRecord.patient, ownerUserId: currentUser.sub },
      });

      const actualAppointment = await service.getAppointmentById(appointmentId, currentUser);

      expect(actualAppointment.id).toBe(appointmentId);
    });
  });

  describe('createAppointment', () => {
    const createPayload = {
      patientId,
      doctorId,
      scheduledAt: futureMondayNineUtc,
      reason: 'Routine check',
    };

    it('throws forbidden when actor lacks appointment.create permission', async () => {
      mockPermissions([]);

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws bad request when patient is missing or inactive', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActivePatientById.mockResolvedValue(null);

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws bad request when doctor is missing or inactive', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue(null);

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws forbidden for create:own scope when actor is not a participant', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'OWN' }]);

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows create:own scope when actor owns the doctor profile', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: currentUser.sub,
        schedules: [],
      });

      const actualAppointment = await service.createAppointment(createPayload, currentUser);

      expect(actualAppointment.id).toBe(appointmentId);
      expect(repositoryMock.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: currentUser.sub }),
      );
    });

    it('throws bad request when scheduledAt is in the past', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.createAppointment(
          { ...createPayload, scheduledAt: '2020-01-06T09:00:00.000Z' },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request when doctor is not available at the requested time', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: null,
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '10:00',
            endTime: '12:00',
            isAvailable: true,
          },
        ],
      });

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepts a slot inside an available schedule window in clinic time', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: null,
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '08:00',
            endTime: '12:00',
            isAvailable: true,
          },
        ],
      });
      const inputMondayNineJakarta = '2027-01-04T02:00:00.000Z';

      const actualAppointment = await service.createAppointment(
        { ...createPayload, scheduledAt: inputMondayNineJakarta },
        currentUser,
      );

      expect(actualAppointment.id).toBe(appointmentId);
    });

    it('rejects a slot that only matches the schedule window in UTC', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: null,
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '08:00',
            endTime: '12:00',
            isAvailable: true,
          },
        ],
      });

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws conflict when doctor already has an open appointment at the slot', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findConflictingAppointment.mockResolvedValue({ id: 'other-appointment' });

      await expect(service.createAppointment(createPayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('updateAppointment', () => {
    it('throws not found when appointment does not exist', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue(null);

      await expect(
        service.updateAppointment(appointmentId, { status: 'CONFIRMED' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws forbidden for update:own scope when actor is not a participant', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'OWN' }]);

      await expect(
        service.updateAppointment(appointmentId, { status: 'CONFIRMED' }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids patient-owned scope from updating status or notes', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        patient: { ...appointmentRecord.patient, ownerUserId: currentUser.sub },
      });

      await expect(
        service.updateAppointment(appointmentId, { status: 'CONFIRMED' }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows patient-owned scope to update reason', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        patient: { ...appointmentRecord.patient, ownerUserId: currentUser.sub },
      });

      await service.updateAppointment(appointmentId, { reason: 'Updated reason' }, currentUser);

      expect(repositoryMock.updateAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Updated reason' }),
      );
    });

    it('allows doctor-owned scope to update status', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        doctor: { ...appointmentRecord.doctor, ownerUserId: currentUser.sub },
      });

      await service.updateAppointment(appointmentId, { status: 'CONFIRMED' }, currentUser);

      expect(repositoryMock.updateAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
    });

    it('throws conflict on a disallowed status transition', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.updateAppointment(appointmentId, { status: 'COMPLETED' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws conflict when updating a terminal appointment', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        status: 'CANCELLED',
      });

      await expect(
        service.updateAppointment(appointmentId, { reason: 'Late edit' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws conflict when patient reschedules a confirmed appointment', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        status: 'CONFIRMED',
        patient: { ...appointmentRecord.patient, ownerUserId: currentUser.sub },
      });

      await expect(
        service.updateAppointment(
          appointmentId,
          { scheduledAt: '2027-01-11T09:00:00.000Z' },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('revalidates availability and conflicts when rescheduling', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);

      await service.updateAppointment(
        appointmentId,
        { scheduledAt: '2027-01-11T09:00:00.000Z' },
        currentUser,
      );

      expect(repositoryMock.findConflictingAppointment).toHaveBeenCalledWith({
        doctorId,
        scheduledAt: new Date('2027-01-11T09:00:00.000Z'),
        excludeAppointmentId: appointmentId,
      });
      expect(repositoryMock.updateAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ scheduledAt: new Date('2027-01-11T09:00:00.000Z') }),
      );
    });
  });

  describe('cancelAppointment', () => {
    it('throws not found when appointment does not exist', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue(null);

      await expect(
        service.cancelAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws forbidden for cancel:own scope when actor is not a participant', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'OWN' }]);

      await expect(
        service.cancelAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws conflict when appointment is already terminal', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        status: 'COMPLETED',
      });

      await expect(
        service.cancelAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels and appends the cancellation reason to notes', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        notes: 'Existing note',
      });

      await service.cancelAppointment(appointmentId, { reason: 'Patient request' }, currentUser);

      expect(repositoryMock.cancelAppointment).toHaveBeenCalledWith({
        id: appointmentId,
        notes: 'Existing note\nCancellation reason: Patient request',
      });
    });

    it('cancels without touching notes when no reason is given', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'ANY' }]);

      await service.cancelAppointment(appointmentId, {}, currentUser);

      expect(repositoryMock.cancelAppointment).toHaveBeenCalledWith({
        id: appointmentId,
        notes: undefined,
      });
    });
  });
});
