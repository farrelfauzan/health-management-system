import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { ListEncountersQueryDto } from '../dto/list-encounters-query.dto';
import { OpenEncounterDto } from '../dto/open-encounter.dto';
import { UpdateEncounterSoapDto } from '../dto/update-encounter-soap.dto';
import { EncounterRepository } from '../repository/encounter.repository';
import { EncounterAccessService } from './encounter-access.service';
import { EncounterMapper } from './encounter.mapper';
import { EncounterService } from './encounter.service';

type PermissionScope = 'ANY' | 'OWN';

function buildActor(
  permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
) {
  return {
    roles: [
      {
        role: {
          permissions: permissions.map((permission) => ({ permission })),
        },
      },
    ],
  };
}

describe('EncounterService', () => {
  const encounterRepositoryMock = {
    listEncounters: jest.fn(),
    findEncounterWithRelationsById: jest.fn(),
    findEncounterDetailById: jest.fn(),
    findEncounterIdByRegistrationId: jest.fn(),
    findRegistrationForEncounter: jest.fn(),
    findActiveDoctorById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    createEncounter: jest.fn(),
    updateEncounter: jest.fn(),
    closeEncounter: jest.fn(),
  } as unknown as EncounterRepository;

  const authRepositoryMock = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const accessService = new EncounterAccessService(encounterRepositoryMock, authRepositoryMock);
  const service = new EncounterService(
    encounterRepositoryMock,
    accessService,
    new EncounterMapper(),
  );

  const adminUser = { sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8', email: 'admin@hms.local' };
  const doctorUser = { sub: '9b1c0a55-2c93-4a55-9a01-1a2b3c4d5e6f', email: 'doctor@hms.local' };

  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const registrationId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11';
  const timestamp = new Date('2026-07-20T08:00:00.000Z');

  const encounterRecord = {
    id: encounterId,
    registrationId,
    patientId,
    doctorId,
    status: 'IN_PROGRESS' as const,
    startedAt: timestamp,
    endedAt: null,
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    createdById: adminUser.sub,
    createdAt: timestamp,
    updatedAt: timestamp,
    patient: { id: patientId, mrn: '00000001', fullName: 'Aisha Rahman', ownerUserId: null },
    doctor: {
      id: doctorId,
      licenseNumber: 'SIP-2026-0001',
      fullName: 'Dr. Budi Santoso',
      ownerUserId: doctorUser.sub,
    },
    _count: { vitalSigns: 0, diagnoses: 0, procedures: 0 },
  };

  const checkedInRegistration = {
    id: registrationId,
    patientId,
    status: 'CHECKED_IN' as const,
    patient: { id: patientId, ownerUserId: null, isActive: true },
  };

  function mockActor(
    permissions: Array<{ action: string; resource: string; scope: PermissionScope }>,
  ): void {
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(buildActor(permissions));
  }

  function mockAdminWriter(): void {
    mockActor([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]);
  }

  function mockDoctorWriter(): void {
    mockActor([{ action: 'write', resource: 'Encounter', scope: 'OWN' }]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listEncounters', () => {
    it('scopes the query to the caller when the actor only holds OWN', async () => {
      mockActor([{ action: 'read', resource: 'Encounter', scope: 'OWN' }]);
      (encounterRepositoryMock.listEncounters as jest.Mock).mockResolvedValue({
        items: [encounterRecord],
        page: 1,
        limit: 10,
        total: 1,
      });
      const inputQuery = { page: 1, limit: 10 } as ListEncountersQueryDto;

      const actual = await service.listEncounters(inputQuery, doctorUser);

      expect(encounterRepositoryMock.listEncounters).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: doctorUser.sub }),
      );
      expect(actual.items[0]?.id).toBe(encounterId);
      expect(actual.meta.total).toBe(1);
    });

    it('leaves the query unscoped for an actor holding ANY', async () => {
      mockActor([{ action: 'read', resource: 'Encounter', scope: 'ANY' }]);
      (encounterRepositoryMock.listEncounters as jest.Mock).mockResolvedValue({
        items: [],
        page: 1,
        limit: 10,
        total: 0,
      });

      await service.listEncounters({ page: 1, limit: 10 } as ListEncountersQueryDto, adminUser);

      expect(encounterRepositoryMock.listEncounters).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: undefined }),
      );
    });

    it('rejects an actor holding neither scope', async () => {
      mockActor([]);

      await expect(
        service.listEncounters({ page: 1, limit: 10 } as ListEncountersQueryDto, adminUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getEncounterById', () => {
    it('lets an assigned doctor read an encounter they did not attend', async () => {
      mockActor([{ action: 'read', resource: 'Encounter', scope: 'OWN' }]);
      const otherDoctorEncounter = {
        ...encounterRecord,
        doctor: { ...encounterRecord.doctor, ownerUserId: 'someone-else' },
      };
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
        otherDoctorEncounter,
      );
      (encounterRepositoryMock.findActiveDoctorByOwnerUserId as jest.Mock).mockResolvedValue({
        id: 'covering-doctor',
        ownerUserId: doctorUser.sub,
      });
      (encounterRepositoryMock.findActiveDoctorPatientAssignment as jest.Mock).mockResolvedValue({
        id: 'assignment-1',
      });
      (encounterRepositoryMock.findEncounterDetailById as jest.Mock).mockResolvedValue({
        ...otherDoctorEncounter,
        vitalSigns: [],
        diagnoses: [],
        procedures: [],
        prescriptions: [],
      });

      const actual = await service.getEncounterById(encounterId, doctorUser);

      expect(actual.id).toBe(encounterId);
    });

    it('refuses an unrelated doctor with no assignment', async () => {
      mockActor([{ action: 'read', resource: 'Encounter', scope: 'OWN' }]);
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        doctor: { ...encounterRecord.doctor, ownerUserId: 'someone-else' },
      });
      (encounterRepositoryMock.findActiveDoctorByOwnerUserId as jest.Mock).mockResolvedValue(null);

      await expect(service.getEncounterById(encounterId, doctorUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('reports a missing encounter as not found', async () => {
      mockActor([{ action: 'read', resource: 'Encounter', scope: 'ANY' }]);
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(null);

      await expect(service.getEncounterById(encounterId, adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('derives BMI on read rather than reading a stored column', async () => {
      mockActor([{ action: 'read', resource: 'Encounter', scope: 'ANY' }]);
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
        encounterRecord,
      );
      (encounterRepositoryMock.findEncounterDetailById as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        vitalSigns: [
          {
            id: 'vitals-1',
            encounterId,
            heightCm: 160,
            weightKg: 64,
            systolicBloodPressure: null,
            diastolicBloodPressure: null,
            pulseRate: null,
            respiratoryRate: null,
            temperatureCelsius: null,
            oxygenSaturation: null,
            notes: null,
            recordedAt: timestamp,
            recordedById: adminUser.sub,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        diagnoses: [],
        procedures: [],
        prescriptions: [],
      });

      const actual = await service.getEncounterById(encounterId, adminUser);

      expect(actual.vitalSigns[0]?.bodyMassIndex).toBe(25);
    });
  });

  describe('openEncounter', () => {
    it('opens the record from a CHECKED_IN registration', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.findEncounterIdByRegistrationId as jest.Mock).mockResolvedValue(null);
      (encounterRepositoryMock.findActiveDoctorById as jest.Mock).mockResolvedValue({
        id: doctorId,
        ownerUserId: doctorUser.sub,
      });
      (encounterRepositoryMock.createEncounter as jest.Mock).mockResolvedValue(encounterRecord);

      const actual = await service.openEncounter(
        { registrationId, doctorId } as OpenEncounterDto,
        adminUser,
      );

      expect(encounterRepositoryMock.createEncounter).toHaveBeenCalledWith({
        registrationId,
        patientId,
        doctorId,
        createdById: adminUser.sub,
      });
      expect(actual.status).toBe('IN_PROGRESS');
    });

    it('refuses a registration that has not checked in', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue({
        ...checkedInRegistration,
        status: 'PENDING',
      });

      await expect(
        service.openEncounter({ registrationId, doctorId } as OpenEncounterDto, adminUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a second encounter on the same registration', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.findEncounterIdByRegistrationId as jest.Mock).mockResolvedValue({
        id: encounterId,
      });

      await expect(
        service.openEncounter({ registrationId, doctorId } as OpenEncounterDto, adminUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('pins an OWN-scoped doctor to their own profile', async () => {
      mockDoctorWriter();
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.findEncounterIdByRegistrationId as jest.Mock).mockResolvedValue(null);
      (encounterRepositoryMock.findActiveDoctorByOwnerUserId as jest.Mock).mockResolvedValue({
        id: doctorId,
        ownerUserId: doctorUser.sub,
      });
      (encounterRepositoryMock.createEncounter as jest.Mock).mockResolvedValue(encounterRecord);

      await service.openEncounter({ registrationId } as OpenEncounterDto, doctorUser);

      expect(encounterRepositoryMock.createEncounter).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId }),
      );
    });

    it('refuses an OWN-scoped doctor naming another practitioner', async () => {
      mockDoctorWriter();
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.findEncounterIdByRegistrationId as jest.Mock).mockResolvedValue(null);
      (encounterRepositoryMock.findActiveDoctorByOwnerUserId as jest.Mock).mockResolvedValue({
        id: doctorId,
        ownerUserId: doctorUser.sub,
      });

      await expect(
        service.openEncounter(
          { registrationId, doctorId: 'a-different-doctor' } as OpenEncounterDto,
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a named doctor when opening on someone else behalf', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.findEncounterIdByRegistrationId as jest.Mock).mockResolvedValue(null);

      await expect(
        service.openEncounter({ registrationId } as OpenEncounterDto, adminUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateEncounterSoap', () => {
    it('writes only the sections the request names', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
        encounterRecord,
      );
      (encounterRepositoryMock.updateEncounter as jest.Mock).mockResolvedValue(encounterRecord);

      await service.updateEncounterSoap(
        encounterId,
        { subjective: 'Batuk 3 hari' } as UpdateEncounterSoapDto,
        adminUser,
      );

      expect(encounterRepositoryMock.updateEncounter).toHaveBeenCalledWith({
        id: encounterId,
        subjective: 'Batuk 3 hari',
      });
    });

    it('passes an explicit null through so a section can be cleared', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
        encounterRecord,
      );
      (encounterRepositoryMock.updateEncounter as jest.Mock).mockResolvedValue(encounterRecord);

      await service.updateEncounterSoap(
        encounterId,
        { plan: null } as UpdateEncounterSoapDto,
        adminUser,
      );

      expect(encounterRepositoryMock.updateEncounter).toHaveBeenCalledWith({
        id: encounterId,
        plan: null,
      });
    });

    it('refuses to write a closed record', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        status: 'FINISHED',
      });

      await expect(
        service.updateEncounterSoap(
          encounterId,
          { plan: 'Kontrol 3 hari' } as UpdateEncounterSoapDto,
          adminUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a doctor writing an encounter they did not attend', async () => {
      mockDoctorWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        doctor: { ...encounterRecord.doctor, ownerUserId: 'someone-else' },
      });

      await expect(
        service.updateEncounterSoap(
          encounterId,
          { plan: 'Kontrol 3 hari' } as UpdateEncounterSoapDto,
          doctorUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('closeEncounter', () => {
    it('finishes the encounter and completes its registration together', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
        encounterRecord,
      );
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.closeEncounter as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        status: 'FINISHED',
        endedAt: timestamp,
      });

      const actual = await service.closeEncounter(encounterId, adminUser);

      expect(encounterRepositoryMock.closeEncounter).toHaveBeenCalledWith(
        expect.objectContaining({
          id: encounterId,
          registrationId,
          status: 'FINISHED',
          registrationStatus: 'COMPLETED',
        }),
      );
      expect(actual.status).toBe('FINISHED');
    });

    it('refuses to close an already closed record', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        status: 'FINISHED',
      });

      await expect(service.closeEncounter(encounterId, adminUser)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancelEncounter', () => {
    it('retracts the encounter and cancels its registration', async () => {
      mockAdminWriter();
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
        encounterRecord,
      );
      (encounterRepositoryMock.findRegistrationForEncounter as jest.Mock).mockResolvedValue(
        checkedInRegistration,
      );
      (encounterRepositoryMock.closeEncounter as jest.Mock).mockResolvedValue({
        ...encounterRecord,
        status: 'CANCELLED',
        endedAt: timestamp,
      });

      await service.cancelEncounter(encounterId, adminUser);

      expect(encounterRepositoryMock.closeEncounter).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED', registrationStatus: 'CANCELLED' }),
      );
    });
  });
});
