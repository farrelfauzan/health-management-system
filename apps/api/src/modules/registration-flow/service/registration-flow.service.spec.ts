import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { RegistrationFlowRepository } from '../repository/registration-flow.repository';
import { RegistrationFlowService } from './registration-flow.service';

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

describe('RegistrationFlowService', () => {
  const registrationFlowRepositoryMock = {
    listRegistrations: jest.fn(),
    findRegistrationDetailById: jest.fn(),
    findActivePatientById: jest.fn(),
    findActiveAppointmentById: jest.fn(),
    findRegistrationByAppointmentId: jest.fn(),
    findOpenRegistrationByPatientId: jest.fn(),
    createRegistration: jest.fn(),
    updateRegistration: jest.fn(),
    listQueueBoard: jest.fn(),
  } as unknown as RegistrationFlowRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const configServiceMock = {
    get: jest.fn().mockReturnValue('Asia/Jakarta'),
  } as unknown as ConfigService;

  const service = new RegistrationFlowService(
    registrationFlowRepositoryMock,
    authRepositoryMock,
    configServiceMock,
  );

  const currentUser = {
    sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8',
    email: 'admin@hms.local',
  };

  const registrationId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const appointmentId = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const doctorId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11';

  const registrationRecord = {
    id: registrationId,
    patientId,
    appointmentId: null,
    status: 'PENDING',
    queueNumber: 1,
    queueDate: new Date('2026-07-18T00:00:00.000Z'),
    registeredAt: new Date('2026-07-18T08:00:00.000Z'),
    checkedInAt: null,
    completedAt: null,
    createdById: currentUser.sub,
    createdAt: new Date('2026-07-18T08:00:00.000Z'),
    updatedAt: new Date('2026-07-18T08:00:00.000Z'),
    patient: {
      id: patientId,
      mrn: 'MRN-0001',
      fullName: 'Patient One',
      ownerUserId: null,
    },
    appointment: null,
  };

  const openAppointment = {
    id: appointmentId,
    patientId,
    status: 'SCHEDULED',
    scheduledAt: new Date('2027-01-04T09:00:00.000Z'),
  };

  const repositoryMock = registrationFlowRepositoryMock as unknown as {
    listRegistrations: jest.Mock;
    findRegistrationDetailById: jest.Mock;
    findActivePatientById: jest.Mock;
    findActiveAppointmentById: jest.Mock;
    findRegistrationByAppointmentId: jest.Mock;
    findOpenRegistrationByPatientId: jest.Mock;
    createRegistration: jest.Mock;
    updateRegistration: jest.Mock;
    listQueueBoard: jest.Mock;
  };

  const authMock = authRepositoryMock as unknown as { findUserById: jest.Mock };

  function mockPermissions(
    permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
  ): void {
    authMock.findUserById.mockResolvedValue(buildActor(permissions));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.listRegistrations.mockResolvedValue({
      items: [registrationRecord],
      total: 1,
      page: 1,
      limit: 10,
    });
    repositoryMock.findRegistrationDetailById.mockResolvedValue(registrationRecord);
    repositoryMock.findActivePatientById.mockResolvedValue({
      id: patientId,
      ownerUserId: null,
    });
    repositoryMock.findActiveAppointmentById.mockResolvedValue(openAppointment);
    repositoryMock.findRegistrationByAppointmentId.mockResolvedValue(null);
    repositoryMock.findOpenRegistrationByPatientId.mockResolvedValue(null);
    repositoryMock.createRegistration.mockResolvedValue(registrationRecord);
    repositoryMock.updateRegistration.mockResolvedValue(registrationRecord);
    repositoryMock.listQueueBoard.mockResolvedValue([registrationRecord]);
  });

  describe('listRegistrations', () => {
    it('throws forbidden when actor lacks registration.read permission', async () => {
      mockPermissions([]);

      await expect(
        service.listRegistrations({ page: 1, limit: 10 }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not constrain ownership for read:any scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.listRegistrations({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: undefined }),
      );
    });

    it('constrains ownership to current user for read:own scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

      await service.listRegistrations({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: currentUser.sub }),
      );
    });

    it('passes the search term through to the repository', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.listRegistrations({ page: 1, limit: 10, search: 'MRN-0001' }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'MRN-0001' }),
      );
    });

    it('passes the doctor filter through to the repository', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.listRegistrations({ page: 1, limit: 10, doctorId }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId }),
      );
    });

    it('converts calendar-date filters into UTC day boundaries', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.listRegistrations(
        { page: 1, limit: 10, registeredFrom: '2026-07-01', registeredTo: '2026-07-18' },
        currentUser,
      );

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({
          registeredFrom: new Date('2026-07-01T00:00:00.000Z'),
          registeredTo: new Date('2026-07-18T00:00:00.000Z'),
        }),
      );
    });
  });

  describe('getRegistrationById', () => {
    it('throws not found when registration does not exist', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue(null);

      await expect(service.getRegistrationById(registrationId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws forbidden for read:own scope when actor does not own the patient profile', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

      await expect(service.getRegistrationById(registrationId, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns registration for read:own scope when actor owns the patient profile', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        patient: { ...registrationRecord.patient, ownerUserId: currentUser.sub },
      });

      const actualRegistration = await service.getRegistrationById(registrationId, currentUser);

      expect(actualRegistration.id).toBe(registrationId);
    });
  });

  describe('createRegistration', () => {
    const createPayload = {
      patientId,
    };

    it('throws forbidden when actor lacks registration.create permission', async () => {
      mockPermissions([]);

      await expect(service.createRegistration(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws bad request when patient is missing or inactive', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findActivePatientById.mockResolvedValue(null);

      await expect(service.createRegistration(createPayload, currentUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws forbidden for create:own scope when actor does not own the patient profile', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'OWN' }]);

      await expect(service.createRegistration(createPayload, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows create:own scope when actor owns the patient profile', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'OWN' }]);
      repositoryMock.findActivePatientById.mockResolvedValue({
        id: patientId,
        ownerUserId: currentUser.sub,
      });

      const actualRegistration = await service.createRegistration(createPayload, currentUser);

      expect(actualRegistration.id).toBe(registrationId);
      expect(repositoryMock.createRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: currentUser.sub }),
      );
    });

    it('throws conflict when patient already has an open registration', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findOpenRegistrationByPatientId.mockResolvedValue({
        id: 'other-registration',
      });

      await expect(service.createRegistration(createPayload, currentUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws bad request when linked appointment does not exist', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findActiveAppointmentById.mockResolvedValue(null);

      await expect(
        service.createRegistration({ ...createPayload, appointmentId }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws bad request when linked appointment belongs to another patient', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findActiveAppointmentById.mockResolvedValue({
        ...openAppointment,
        patientId: 'another-patient',
      });

      await expect(
        service.createRegistration({ ...createPayload, appointmentId }, currentUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws conflict when linked appointment is not in a registrable status', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findActiveAppointmentById.mockResolvedValue({
        ...openAppointment,
        status: 'CANCELLED',
      });

      await expect(
        service.createRegistration({ ...createPayload, appointmentId }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws conflict when linked appointment already has a registration', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findRegistrationByAppointmentId.mockResolvedValue({
        id: 'other-registration',
      });

      await expect(
        service.createRegistration({ ...createPayload, appointmentId }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a registration linked to an open appointment', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);

      await service.createRegistration({ ...createPayload, appointmentId }, currentUser);

      expect(repositoryMock.createRegistration).toHaveBeenCalledWith({
        patientId,
        appointmentId,
        createdById: currentUser.sub,
        queueDate: expect.any(Date),
      });
    });

    it('stamps the clinic-local calendar day as the queue date', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      // 18:30 UTC is already 01:30 the next day in Asia/Jakarta (UTC+7).
      jest.useFakeTimers().setSystemTime(new Date('2026-07-18T18:30:00.000Z'));

      try {
        await service.createRegistration(createPayload, currentUser);
      } finally {
        jest.useRealTimers();
      }

      expect(repositoryMock.createRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ queueDate: new Date('2026-07-19T00:00:00.000Z') }),
      );
    });
  });

  describe('getQueueBoard', () => {
    it('throws forbidden when actor only has read:own scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

      await expect(service.getQueueBoard({}, currentUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('queries the requested calendar date as a UTC day', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.getQueueBoard({ date: '2026-07-18' }, currentUser);

      expect(repositoryMock.listQueueBoard).toHaveBeenCalledWith({
        queueDate: new Date('2026-07-18T00:00:00.000Z'),
      });
    });

    it('defaults to today in the clinic time zone', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      // 18:30 UTC is already 01:30 the next day in Asia/Jakarta (UTC+7).
      jest.useFakeTimers().setSystemTime(new Date('2026-07-18T18:30:00.000Z'));

      try {
        await service.getQueueBoard({}, currentUser);
      } finally {
        jest.useRealTimers();
      }

      expect(repositoryMock.listQueueBoard).toHaveBeenCalledWith({
        queueDate: new Date('2026-07-19T00:00:00.000Z'),
      });
    });

    it('maps entries in queue order with per-status counts', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.listQueueBoard.mockResolvedValue([
        registrationRecord,
        {
          ...registrationRecord,
          id: 'a3c1de1a-0d9b-44a1-8c2f-6a3c1de1a003',
          queueNumber: 2,
          status: 'CHECKED_IN',
          checkedInAt: new Date('2026-07-18T09:00:00.000Z'),
        },
      ]);

      const actualBoard = await service.getQueueBoard({ date: '2026-07-18' }, currentUser);

      expect(actualBoard.date).toBe('2026-07-18');
      expect(actualBoard.entries.map((entry) => entry.queueNumber)).toEqual([1, 2]);
      expect(actualBoard.entries[1]?.checkedInAt).toBe('2026-07-18T09:00:00.000Z');
      expect(actualBoard.counts).toEqual({
        pending: 1,
        checkedIn: 1,
        completed: 0,
        cancelled: 0,
      });
    });

    it('skips legacy rows without a queue number', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.listQueueBoard.mockResolvedValue([
        { ...registrationRecord, queueNumber: null, queueDate: null },
      ]);

      const actualBoard = await service.getQueueBoard({ date: '2026-07-18' }, currentUser);

      expect(actualBoard.entries).toEqual([]);
    });
  });

  describe('updateRegistration', () => {
    it('throws not found when registration does not exist', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue(null);

      await expect(
        service.updateRegistration(registrationId, { status: 'CHECKED_IN' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws forbidden for update:own scope when actor does not own the patient profile', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);

      await expect(
        service.updateRegistration(registrationId, { status: 'CANCELLED' }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids patient-owned scope from checking in', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        patient: { ...registrationRecord.patient, ownerUserId: currentUser.sub },
      });

      await expect(
        service.updateRegistration(registrationId, { status: 'CHECKED_IN' }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids patient-owned scope from changing the appointment link', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        patient: { ...registrationRecord.patient, ownerUserId: currentUser.sub },
      });

      await expect(
        service.updateRegistration(registrationId, { appointmentId }, currentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows patient-owned scope to cancel a pending registration', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        patient: { ...registrationRecord.patient, ownerUserId: currentUser.sub },
      });

      await service.updateRegistration(registrationId, { status: 'CANCELLED' }, currentUser);

      expect(repositoryMock.updateRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED' }),
      );
    });

    it('throws conflict on a disallowed status transition', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);

      await expect(
        service.updateRegistration(registrationId, { status: 'COMPLETED' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws conflict when updating a terminal registration', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        status: 'CANCELLED',
      });

      await expect(
        service.updateRegistration(registrationId, { status: 'CHECKED_IN' }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('stamps checkedInAt when checking in a pending registration', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);

      await service.updateRegistration(registrationId, { status: 'CHECKED_IN' }, currentUser);

      expect(repositoryMock.updateRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CHECKED_IN', checkedInAt: expect.any(Date) }),
      );
    });

    it('stamps completedAt when completing a checked-in registration', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        status: 'CHECKED_IN',
        checkedInAt: new Date('2026-07-18T09:00:00.000Z'),
      });

      await service.updateRegistration(registrationId, { status: 'COMPLETED' }, currentUser);

      expect(repositoryMock.updateRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
      );
    });

    it('throws conflict when changing the appointment link after check-in', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.findRegistrationDetailById.mockResolvedValue({
        ...registrationRecord,
        status: 'CHECKED_IN',
      });

      await expect(
        service.updateRegistration(registrationId, { appointmentId }, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('links an open appointment while the registration is pending', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);

      await service.updateRegistration(registrationId, { appointmentId }, currentUser);

      expect(repositoryMock.findRegistrationByAppointmentId).toHaveBeenCalledWith(
        appointmentId,
        registrationId,
      );
      expect(repositoryMock.updateRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId }),
      );
    });

    it('unlinks the appointment while the registration is pending', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'ANY' }]);

      await service.updateRegistration(registrationId, { appointmentId: null }, currentUser);

      expect(repositoryMock.findActiveAppointmentById).not.toHaveBeenCalled();
      expect(repositoryMock.updateRegistration).toHaveBeenCalledWith(
        expect.objectContaining({ appointmentId: null }),
      );
    });
  });
});
