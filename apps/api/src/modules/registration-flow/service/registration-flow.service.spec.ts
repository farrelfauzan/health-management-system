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

  const generalPoliId = '2f5c7a30-1b4e-4a7d-9f1c-1de1a0040001';
  const dentalPoliId = '3a6d8b41-2c5f-4b8e-8a2d-1de1a0040002';

  // A walk-in: on the clinic-wide ticket roll, with no poli yet.
  const registrationRecord = {
    id: registrationId,
    patientId,
    appointmentId: null,
    status: 'PENDING',
    queueNumber: 1,
    queueDate: new Date('2026-07-18T00:00:00.000Z'),
    specialtyId: null,
    poliQueueNumber: null,
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
    specialty: null,
  };

  function buildPoliRegistration(overrides: {
    id: string;
    queueNumber: number;
    poliQueueNumber: number;
    poliId: string;
    poliName: string;
    status?: string;
  }) {
    return {
      ...registrationRecord,
      id: overrides.id,
      queueNumber: overrides.queueNumber,
      status: overrides.status ?? 'PENDING',
      specialtyId: overrides.poliId,
      poliQueueNumber: overrides.poliQueueNumber,
      specialty: { id: overrides.poliId, name: overrides.poliName },
    };
  }

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

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(expect.any(Object), {
        userId: currentUser.sub,
        scope: 'ANY',
      });
    });

    it('constrains ownership to current user for read:own scope', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

      await service.listRegistrations({ page: 1, limit: 10 }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(expect.any(Object), {
        userId: currentUser.sub,
        scope: 'OWN',
      });
    });

    it('passes the search term through to the repository', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.listRegistrations({ page: 1, limit: 10, search: 'MRN-0001' }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'MRN-0001' }),
        expect.any(Object),
      );
    });

    it('passes the doctor filter through to the repository', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.listRegistrations({ page: 1, limit: 10, doctorId }, currentUser);

      expect(repositoryMock.listRegistrations).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId }),
        expect.any(Object),
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
        expect.any(Object),
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

    it('returns not-found for read:own scope when the scoped where-clause misses', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'OWN' }]);

      // The patient-side scope filtered the row in SQL (SJ-2): someone else's
      // registration and a nonexistent one are the same null.
      repositoryMock.findRegistrationDetailById.mockResolvedValue(null);

      await expect(service.getRegistrationById(registrationId, currentUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.findRegistrationDetailById).toHaveBeenCalledWith(registrationId, {
        userId: currentUser.sub,
        scope: 'OWN',
      });
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
        actorUserId: currentUser.sub,
        privacyNotice: undefined,
        queueDate: expect.any(Date),
      });
    });

    it('forbids an own patient from recording representative evidence', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'OWN' }]);

      await expect(
        service.createRegistration(
          {
            ...createPayload,
            privacyNotice: {
              privacyNoticeVersionId: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9',
              locale: 'id',
              outcome: 'ACKNOWLEDGED',
              subjectType: 'REPRESENTATIVE',
              representativeName: 'Representative',
              representativeRelation: 'Parent',
              provenance: 'PATIENT_PORTAL',
            },
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids an own patient from emergency deferral', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'OWN' }]);

      await expect(
        service.createRegistration(
          {
            ...createPayload,
            privacyNotice: {
              privacyNoticeVersionId: 'c2a3ecb0-a352-4d49-a47c-39d1b67904c9',
              locale: 'id',
              outcome: 'DEFERRED_EMERGENCY',
              subjectType: 'SELF',
              provenance: 'EMERGENCY',
            },
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
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

    // A patient can only read the board through their own registration (the
    // board itself is ANY-scoped), so the poli ticket has to appear here too.
    it('returns both tickets on the created registration', async () => {
      mockPermissions([{ action: 'create', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.createRegistration.mockResolvedValue(
        buildPoliRegistration({
          id: registrationId,
          queueNumber: 12,
          poliQueueNumber: 4,
          poliId: generalPoliId,
          poliName: 'Poli Umum',
        }),
      );

      const actualRegistration = await service.createRegistration(createPayload, currentUser);

      expect(actualRegistration.queueNumber).toBe(12);
      expect(actualRegistration.poliQueueNumber).toBe(4);
      expect(actualRegistration.poli).toEqual({ id: generalPoliId, name: 'Poli Umum' });
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

    it('carries both numbers on an entry booked into a poli', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.listQueueBoard.mockResolvedValue([
        buildPoliRegistration({
          id: 'a3c1de1a-0d9b-44a1-8c2f-6a3c1de1a010',
          queueNumber: 7,
          poliQueueNumber: 2,
          poliId: generalPoliId,
          poliName: 'Poli Umum',
        }),
      ]);

      const actualBoard = await service.getQueueBoard({ date: '2026-07-18' }, currentUser);

      expect(actualBoard.entries[0]?.queueNumber).toBe(7);
      expect(actualBoard.entries[0]?.poliQueueNumber).toBe(2);
      expect(actualBoard.entries[0]?.poli).toEqual({ id: generalPoliId, name: 'Poli Umum' });
    });

    // The clinic-wide roll must keep working for someone whose poli is not yet
    // known, so the poli fields are simply absent rather than zeroed.
    it('leaves the poli fields off a walk-in with no appointment', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.listQueueBoard.mockResolvedValue([registrationRecord]);

      const actualBoard = await service.getQueueBoard({ date: '2026-07-18' }, currentUser);

      expect(actualBoard.entries[0]?.poliQueueNumber).toBeUndefined();
      expect(actualBoard.entries[0]?.poli).toBeUndefined();
      expect(actualBoard.poli).toEqual([]);
    });

    it('summarizes each poli separately, in name order, ignoring poli-less entries', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);
      repositoryMock.listQueueBoard.mockResolvedValue([
        buildPoliRegistration({
          id: 'a3c1de1a-0d9b-44a1-8c2f-6a3c1de1a011',
          queueNumber: 1,
          poliQueueNumber: 1,
          poliId: generalPoliId,
          poliName: 'Poli Umum',
          status: 'COMPLETED',
        }),
        registrationRecord,
        buildPoliRegistration({
          id: 'a3c1de1a-0d9b-44a1-8c2f-6a3c1de1a012',
          queueNumber: 3,
          poliQueueNumber: 1,
          poliId: dentalPoliId,
          poliName: 'Poli Gigi',
        }),
        buildPoliRegistration({
          id: 'a3c1de1a-0d9b-44a1-8c2f-6a3c1de1a013',
          queueNumber: 4,
          poliQueueNumber: 2,
          poliId: generalPoliId,
          poliName: 'Poli Umum',
          status: 'CHECKED_IN',
        }),
      ]);

      const actualBoard = await service.getQueueBoard({ date: '2026-07-18' }, currentUser);

      expect(actualBoard.poli).toEqual([
        {
          poli: { id: dentalPoliId, name: 'Poli Gigi' },
          waiting: 1,
          counts: { pending: 1, checkedIn: 0, completed: 0, cancelled: 0 },
          lastIssuedNumber: 1,
        },
        {
          poli: { id: generalPoliId, name: 'Poli Umum' },
          waiting: 1,
          counts: { pending: 0, checkedIn: 1, completed: 1, cancelled: 0 },
          lastIssuedNumber: 2,
        },
      ]);
      // The walk-in is still on the board; it simply belongs to no poli.
      expect(actualBoard.entries).toHaveLength(4);
    });

    it('passes a poli filter through to the repository', async () => {
      mockPermissions([{ action: 'read', resource: 'Registration', scope: 'ANY' }]);

      await service.getQueueBoard({ date: '2026-07-18', specialtyId: generalPoliId }, currentUser);

      expect(repositoryMock.listQueueBoard).toHaveBeenCalledWith({
        queueDate: new Date('2026-07-18T00:00:00.000Z'),
        specialtyId: generalPoliId,
      });
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

    it('returns not-found for update:own scope when the scoped where-clause misses', async () => {
      mockPermissions([{ action: 'update', resource: 'Registration', scope: 'OWN' }]);

      // The patient-side scope filtered the row in SQL (SJ-2).
      repositoryMock.findRegistrationDetailById.mockResolvedValue(null);

      await expect(
        service.updateRegistration(registrationId, { status: 'CANCELLED' }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.findRegistrationDetailById).toHaveBeenCalledWith(registrationId, {
        userId: currentUser.sub,
        scope: 'OWN',
      });
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
