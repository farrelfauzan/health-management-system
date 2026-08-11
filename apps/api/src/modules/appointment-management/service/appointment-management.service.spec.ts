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
    findScopedActiveDoctorById: jest.fn(),
    findScheduleWindowById: jest.fn(),
    findConflictingAppointment: jest.fn(),
    createAppointment: jest.fn(),
    bookSessionSlot: jest.fn(),
    listActiveDoctorsWithSchedules: jest.fn(),
    listSessionsWithCounts: jest.fn(),
    findSessionWithCountById: jest.fn(),
    getSessionQueue: jest.fn(),
    updateSession: jest.fn(),
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
  const scheduleId = '73f1c6d8-1f34-4e02-9a41-3a58028bab99';
  const sessionId = '91d2b7a5-6c43-4f13-8b52-4b69139cbc11';
  const futureMondayNineUtc = '2027-01-04T09:00:00.000Z';
  const futureMondayDate = '2027-01-04';

  const appointmentRecord = {
    id: appointmentId,
    patientId,
    doctorId,
    type: 'SPECIAL_REQUEST',
    sessionId: null,
    queueNumber: null,
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
      specialty: { name: 'Cardiology' },
      ownerUserId: null,
    },
  };

  const scheduleWindow = {
    id: scheduleId,
    doctorId,
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '12:00',
    isAvailable: true,
    maxPatients: 10,
  };

  const repositoryMock = appointmentManagementRepositoryMock as unknown as {
    listAppointments: jest.Mock;
    findAppointmentDetailById: jest.Mock;
    findActivePatientById: jest.Mock;
    findActiveDoctorById: jest.Mock;
    findScopedActiveDoctorById: jest.Mock;
    findScheduleWindowById: jest.Mock;
    findConflictingAppointment: jest.Mock;
    createAppointment: jest.Mock;
    bookSessionSlot: jest.Mock;
    listActiveDoctorsWithSchedules: jest.Mock;
    listSessionsWithCounts: jest.Mock;
    findSessionWithCountById: jest.Mock;
    getSessionQueue: jest.Mock;
    updateSession: jest.Mock;
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
    repositoryMock.findScopedActiveDoctorById.mockResolvedValue({
      id: doctorId,
      ownerUserId: null,
      schedules: [],
    });
    repositoryMock.findScheduleWindowById.mockResolvedValue(scheduleWindow);
    repositoryMock.findConflictingAppointment.mockResolvedValue(null);
    repositoryMock.createAppointment.mockResolvedValue(appointmentRecord);
    repositoryMock.bookSessionSlot.mockResolvedValue({
      outcome: 'BOOKED',
      appointmentId,
    });
    repositoryMock.listActiveDoctorsWithSchedules.mockResolvedValue([]);
    repositoryMock.listSessionsWithCounts.mockResolvedValue([]);
    repositoryMock.findSessionWithCountById.mockResolvedValue(null);
    repositoryMock.getSessionQueue.mockResolvedValue([]);
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

      expect(repositoryMock.listAppointments).toHaveBeenCalledWith(expect.any(Object), {
        userId: currentUser.sub,
        scope: 'ANY',
      });
    });

    it('constrains ownership to current user for read:own scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'OWN' }]);

      await service.listAppointments({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listAppointments).toHaveBeenCalledWith(expect.any(Object), {
        userId: currentUser.sub,
        scope: 'OWN',
      });
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

    it('returns not-found for read:own scope when the scoped where-clause misses', async () => {
      mockPermissions([{ action: 'read', resource: 'Appointment', scope: 'OWN' }]);

      // The participant scope filtered the row in SQL (SJ-2): someone else's
      // appointment and a nonexistent one are the same null.
      repositoryMock.findAppointmentDetailById.mockResolvedValue(null);

      await expect(service.getAppointmentById(appointmentId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.findAppointmentDetailById).toHaveBeenCalledWith(appointmentId, {
        userId: currentUser.sub,
        scope: 'OWN',
      });
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

  describe('createAppointment - special request', () => {
    const specialRequestPayload = {
      type: 'SPECIAL_REQUEST' as const,
      patientId,
      doctorId,
      requestedAt: futureMondayNineUtc,
      reason: 'Needs a longer consultation slot',
    };

    it('throws forbidden when actor lacks appointment.create permission', async () => {
      mockPermissions([]);

      await expect(
        service.createAppointment(specialRequestPayload, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws bad request when patient is missing or inactive', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActivePatientById.mockResolvedValue(null);

      await expect(
        service.createAppointment(specialRequestPayload, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request when doctor is missing or inactive', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findActiveDoctorById.mockResolvedValue(null);

      await expect(
        service.createAppointment(specialRequestPayload, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws forbidden for create:own scope when actor is not a participant', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'OWN' }]);

      await expect(
        service.createAppointment(specialRequestPayload, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws bad request when requestedAt is in the past', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.createAppointment(
          { ...specialRequestPayload, requestedAt: '2020-01-06T09:00:00.000Z' },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request when a non-approver requests less than 3 days ahead', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findActivePatientById.mockResolvedValue({
        id: patientId,
        ownerUserId: currentUser.sub,
      });
      const inputRequestedAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.createAppointment(
          { ...specialRequestPayload, requestedAt: inputRequestedAt },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows an approver to schedule closer than the patient lead time', async () => {
      mockPermissions([
        { action: 'create', resource: 'Appointment', scope: 'ANY' },
        { action: 'approve', resource: 'Appointment', scope: 'ANY' },
      ]);
      const inputRequestedAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await service.createAppointment(
        { ...specialRequestPayload, requestedAt: inputRequestedAt },
        currentUser,
      );

      expect(repositoryMock.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SCHEDULED' }),
      );
    });

    it('creates a pending request when actor can not approve', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findActivePatientById.mockResolvedValue({
        id: patientId,
        ownerUserId: currentUser.sub,
      });

      await service.createAppointment(specialRequestPayload, currentUser);

      expect(repositoryMock.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SPECIAL_REQUEST', status: 'REQUESTED' }),
      );
      expect(repositoryMock.findConflictingAppointment).not.toHaveBeenCalled();
    });

    it('auto-schedules the request when actor can approve', async () => {
      mockPermissions([
        { action: 'create', resource: 'Appointment', scope: 'ANY' },
        { action: 'approve', resource: 'Appointment', scope: 'ANY' },
      ]);

      await service.createAppointment(specialRequestPayload, currentUser);

      expect(repositoryMock.findConflictingAppointment).toHaveBeenCalledWith({
        doctorId,
        scheduledAt: new Date(futureMondayNineUtc),
      });
      expect(repositoryMock.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SPECIAL_REQUEST', status: 'SCHEDULED' }),
      );
    });

    it('throws conflict for an approver when the slot is taken', async () => {
      mockPermissions([
        { action: 'create', resource: 'Appointment', scope: 'ANY' },
        { action: 'approve', resource: 'Appointment', scope: 'ANY' },
      ]);
      repositoryMock.findConflictingAppointment.mockResolvedValue({ id: 'other-appointment' });

      await expect(
        service.createAppointment(specialRequestPayload, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createAppointment - session booking', () => {
    const sessionPayload = {
      type: 'SESSION' as const,
      patientId,
      doctorId,
      scheduleId,
      sessionDate: futureMondayDate,
    };

    it('books a slot with the session start converted from clinic time', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

      const actualAppointment = await service.createAppointment(sessionPayload, currentUser);

      expect(repositoryMock.bookSessionSlot).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId,
          scheduleId,
          sessionDate: futureMondayDate,
          startTime: '08:00',
          endTime: '12:00',
          maxPatients: 10,
          scheduledAt: new Date('2027-01-04T01:00:00.000Z'),
        }),
      );
      expect(actualAppointment.id).toBe(appointmentId);
    });

    it('throws bad request when the schedule window belongs to another doctor', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findScheduleWindowById.mockResolvedValue({
        ...scheduleWindow,
        doctorId: 'another-doctor-id',
      });

      await expect(service.createAppointment(sessionPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws bad request when sessionDate does not fall on the schedule day', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.createAppointment({ ...sessionPayload, sessionDate: '2027-01-05' }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request when the session is already over', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.createAppointment({ ...sessionPayload, sessionDate: '2020-01-06' }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request within the booking cutoff before the session starts', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2027-01-04T00:30:00.000Z').getTime());

      await expect(service.createAppointment(sessionPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      nowSpy.mockRestore();
    });

    it('accepts a booking just before the cutoff', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2027-01-03T23:59:00.000Z').getTime());

      const actualAppointment = await service.createAppointment(sessionPayload, currentUser);

      expect(actualAppointment.id).toBe(appointmentId);
      nowSpy.mockRestore();
    });

    it('throws conflict when the session is full', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.bookSessionSlot.mockResolvedValue({ outcome: 'SESSION_FULL' });

      await expect(service.createAppointment(sessionPayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws conflict when the patient already booked the session', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.bookSessionSlot.mockResolvedValue({ outcome: 'ALREADY_BOOKED' });

      await expect(service.createAppointment(sessionPayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws conflict when the session is not open', async () => {
      mockPermissions([{ action: 'create', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.bookSessionSlot.mockResolvedValue({ outcome: 'SESSION_NOT_OPEN' });

      await expect(service.createAppointment(sessionPayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('approveAppointment / rejectAppointment', () => {
    const requestedRecord = {
      ...appointmentRecord,
      status: 'REQUESTED',
    };

    it('throws forbidden when actor lacks appointment.approve permission', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.approveAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws conflict when the appointment is not a pending special request', async () => {
      mockPermissions([{ action: 'approve', resource: 'Appointment', scope: 'ANY' }]);

      await expect(
        service.approveAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('approves a pending request into a scheduled appointment', async () => {
      mockPermissions([{ action: 'approve', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue(requestedRecord);

      await service.approveAppointment(appointmentId, {}, currentUser);

      expect(repositoryMock.updateAppointment).toHaveBeenCalledWith({
        id: appointmentId,
        status: 'SCHEDULED',
        scheduledAt: requestedRecord.scheduledAt,
      });
    });

    it('throws conflict when the approved slot is already taken', async () => {
      mockPermissions([{ action: 'approve', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue(requestedRecord);
      repositoryMock.findConflictingAppointment.mockResolvedValue({ id: 'other-appointment' });

      await expect(
        service.approveAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a pending request and records the reason', async () => {
      mockPermissions([{ action: 'approve', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue(requestedRecord);

      await service.rejectAppointment(appointmentId, { reason: 'Outside practice hours' }, currentUser);

      expect(repositoryMock.updateAppointment).toHaveBeenCalledWith({
        id: appointmentId,
        status: 'REJECTED',
        notes: 'Rejection reason: Outside practice hours',
      });
    });
  });

  describe('listDoctorSessions', () => {
    const sessionRange = { from: '2027-01-04', to: '2027-01-11' };

    it('throws forbidden when actor lacks session read permission', async () => {
      mockPermissions([]);

      await expect(
        service.listDoctorSessions(doctorId, sessionRange, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('merges materialized sessions with projected schedule windows', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'ANY' }]);
      repositoryMock.findScopedActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: null,
        schedules: [scheduleWindow],
      });
      repositoryMock.listSessionsWithCounts.mockResolvedValue([
        {
          id: sessionId,
          doctorId,
          scheduleId,
          sessionDate: new Date('2027-01-04T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          maxPatients: 10,
          status: 'OPEN',
          _count: { appointments: 3 },
        },
      ]);

      const actualSessions = await service.listDoctorSessions(doctorId, sessionRange, currentUser);

      expect(actualSessions).toHaveLength(2);
      expect(actualSessions[0]).toMatchObject({
        id: sessionId,
        sessionDate: '2027-01-04',
        bookedCount: 3,
        remaining: 7,
      });
      expect(actualSessions[1]).toMatchObject({
        id: null,
        sessionDate: '2027-01-11',
        bookedCount: 0,
        remaining: 10,
      });
    });

    it('throws bad request when the date range exceeds the limit', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'ANY' }]);

      await expect(
        service.listDoctorSessions(doctorId, { from: '2027-01-01', to: '2027-06-01' }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns not-found when an OWN-scoped actor reads another doctor sessions', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'OWN' }]);
      // The doctor-side scope filtered the row in SQL (SJ-2): another
      // doctor's profile and a missing one are the same null.
      repositoryMock.findScopedActiveDoctorById.mockResolvedValue(null);

      await expect(
        service.listDoctorSessions(doctorId, sessionRange, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.findScopedActiveDoctorById).toHaveBeenCalledWith(doctorId, {
        userId: currentUser.sub,
        scope: 'OWN',
      });
    });

    it('allows an OWN-scoped actor to read their own sessions', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'OWN' }]);
      repositoryMock.findScopedActiveDoctorById.mockResolvedValue({
        id: doctorId,
        ownerUserId: currentUser.sub,
        schedules: [scheduleWindow],
      });

      const actualSessions = await service.listDoctorSessions(doctorId, sessionRange, currentUser);

      expect(actualSessions.length).toBeGreaterThan(0);
    });
  });

  describe('listSessionsCalendar', () => {
    it('projects sessions for every active doctor with doctor info attached', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'ANY' }]);
      repositoryMock.listActiveDoctorsWithSchedules.mockResolvedValue([
        {
          id: doctorId,
          fullName: 'Dr. First',
          specialty: { name: 'Cardiology' },
          schedules: [scheduleWindow],
        },
      ]);
      repositoryMock.listSessionsWithCounts.mockResolvedValue([
        {
          id: sessionId,
          doctorId,
          scheduleId,
          sessionDate: new Date('2027-01-04T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          maxPatients: 10,
          status: 'OPEN',
          _count: { appointments: 4 },
        },
      ]);

      const actualSessions = await service.listSessionsCalendar(
        { from: '2027-01-04', to: '2027-01-04' },
        currentUser,
      );

      expect(actualSessions).toHaveLength(1);
      expect(actualSessions[0]).toMatchObject({
        id: sessionId,
        bookedCount: 4,
        doctor: { id: doctorId, fullName: 'Dr. First', specialty: 'Cardiology' },
      });
    });

    it('throws forbidden without session read permission', async () => {
      mockPermissions([]);

      await expect(
        service.listSessionsCalendar({ from: '2027-01-04', to: '2027-01-04' }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('limits an OWN-scoped actor to their own doctor calendar', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'OWN' }]);
      // The repository filters the roster in SQL (SJ-2) — the service only
      // forwards the actor, so the mock returns the already-scoped set.
      repositoryMock.listActiveDoctorsWithSchedules.mockResolvedValue([
        {
          id: doctorId,
          fullName: 'Dr. First',
          ownerUserId: currentUser.sub,
          specialty: { name: 'Cardiology' },
          schedules: [scheduleWindow],
        },
      ]);

      const actualSessions = await service.listSessionsCalendar(
        { from: '2027-01-04', to: '2027-01-04' },
        currentUser,
      );

      expect(repositoryMock.listActiveDoctorsWithSchedules).toHaveBeenCalledWith({
        userId: currentUser.sub,
        scope: 'OWN',
      });
      expect(actualSessions.length).toBeGreaterThan(0);
      expect(actualSessions.every((session) => session.doctor.id === doctorId)).toBe(true);
    });
  });

  describe('getSessionQueue', () => {
    it('throws not found when session does not exist', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'ANY' }]);

      await expect(service.getSessionQueue(sessionId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns queue entries in check-in order', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'ANY' }]);
      repositoryMock.findSessionWithCountById.mockResolvedValue({
        id: sessionId,
        doctorId,
        scheduleId,
        sessionDate: new Date('2027-01-04T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
        maxPatients: 10,
        status: 'OPEN',
        _count: { appointments: 1 },
      });
      repositoryMock.getSessionQueue.mockResolvedValue([
        {
          id: appointmentId,
          queueNumber: 1,
          status: 'SCHEDULED',
          reason: 'Routine check',
          patient: { id: patientId, mrn: 'MRN-0001', fullName: 'Patient One' },
        },
      ]);

      const actualQueue = await service.getSessionQueue(sessionId, currentUser);

      expect(actualQueue.session.bookedCount).toBe(1);
      expect(actualQueue.queue[0]).toMatchObject({ appointmentId, queueNumber: 1 });
    });

    it('returns not-found when an OWN-scoped actor reads another doctor queue', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'OWN' }]);
      // The doctor-side scope filtered the session in SQL (SJ-2): another
      // doctor's queue and a missing session are the same null.
      repositoryMock.findSessionWithCountById.mockResolvedValue(null);

      await expect(service.getSessionQueue(sessionId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.findSessionWithCountById).toHaveBeenCalledWith(sessionId, {
        userId: currentUser.sub,
        scope: 'OWN',
      });
    });

    it('allows an OWN-scoped actor to read their own session queue', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'OWN' }]);
      repositoryMock.findSessionWithCountById.mockResolvedValue({
        id: sessionId,
        doctorId,
        scheduleId,
        sessionDate: new Date('2027-01-04T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
        maxPatients: 10,
        status: 'OPEN',
        doctor: { ownerUserId: currentUser.sub },
        _count: { appointments: 0 },
      });

      const actualQueue = await service.getSessionQueue(sessionId, currentUser);

      expect(actualQueue.session.id).toBe(sessionId);
    });
  });

  describe('updateSession', () => {
    const existingSession = {
      id: sessionId,
      doctorId,
      scheduleId,
      sessionDate: new Date('2027-01-04T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00',
      maxPatients: 10,
      status: 'OPEN',
      _count: { appointments: 3 },
    };

    it('throws forbidden without session update permission', async () => {
      mockPermissions([{ action: 'read', resource: 'AppointmentSession', scope: 'ANY' }]);

      await expect(
        service.updateSession(sessionId, { maxPatients: 15 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws conflict when the session is already cancelled', async () => {
      mockPermissions([{ action: 'update', resource: 'AppointmentSession', scope: 'ANY' }]);
      repositoryMock.findSessionWithCountById.mockResolvedValue({
        ...existingSession,
        status: 'CANCELLED',
      });

      await expect(
        service.updateSession(sessionId, { status: 'OPEN' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates capacity and status', async () => {
      mockPermissions([{ action: 'update', resource: 'AppointmentSession', scope: 'ANY' }]);
      repositoryMock.findSessionWithCountById.mockResolvedValue(existingSession);
      repositoryMock.updateSession.mockResolvedValue({
        ...existingSession,
        maxPatients: 15,
        status: 'CLOSED',
      });

      const actualSession = await service.updateSession(
        sessionId,
        { maxPatients: 15, status: 'CLOSED' },
        currentUser,
      );

      expect(repositoryMock.updateSession).toHaveBeenCalledWith({
        id: sessionId,
        maxPatients: 15,
        status: 'CLOSED',
      });
      expect(actualSession).toMatchObject({ maxPatients: 15, status: 'CLOSED', bookedCount: 3 });
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

    it('throws bad request when rescheduling a session booking to a specific time', async () => {
      mockPermissions([{ action: 'update', resource: 'Appointment', scope: 'ANY' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        type: 'SESSION',
        sessionId,
        queueNumber: 2,
      });

      await expect(
        service.updateAppointment(
          appointmentId,
          { scheduledAt: '2027-01-11T09:00:00.000Z' },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
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

    it('revalidates conflicts when rescheduling a special request', async () => {
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

    it('returns not-found for cancel:own scope when the scoped where-clause misses', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'OWN' }]);

      // The participant scope filtered the row in SQL (SJ-2).
      repositoryMock.findAppointmentDetailById.mockResolvedValue(null);

      await expect(
        service.cancelAppointment(appointmentId, {}, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.findAppointmentDetailById).toHaveBeenCalledWith(appointmentId, {
        userId: currentUser.sub,
        scope: 'OWN',
      });
    });

    it('allows a patient to withdraw a pending special request', async () => {
      mockPermissions([{ action: 'cancel', resource: 'Appointment', scope: 'OWN' }]);
      repositoryMock.findAppointmentDetailById.mockResolvedValue({
        ...appointmentRecord,
        status: 'REQUESTED',
        patient: { ...appointmentRecord.patient, ownerUserId: currentUser.sub },
      });

      await service.cancelAppointment(appointmentId, {}, currentUser);

      expect(repositoryMock.cancelAppointment).toHaveBeenCalledWith({
        id: appointmentId,
        notes: undefined,
      });
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
