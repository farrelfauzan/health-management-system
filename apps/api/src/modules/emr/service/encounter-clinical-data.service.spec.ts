import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { AuthRepository } from '../../auth/repository/auth.repository';
import { Icd9cmCodeService } from '../../terminology/service/icd9cm-code.service';
import { Icd10CodeService } from '../../terminology/service/icd10-code.service';
import { AddDiagnosisDto } from '../dto/add-diagnosis.dto';
import { AddProcedureDto } from '../dto/add-procedure.dto';
import { RecordVitalSignsDto } from '../dto/record-vital-signs.dto';
import { EncounterRepository } from '../repository/encounter.repository';
import { EncounterAccessService } from './encounter-access.service';
import { EncounterClinicalDataService } from './encounter-clinical-data.service';
import { EncounterMapper } from './encounter.mapper';

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

describe('EncounterClinicalDataService', () => {
  const encounterRepositoryMock = {
    findEncounterWithRelationsById: jest.fn(),
    findActiveDoctorByOwnerUserId: jest.fn(),
    findActiveDoctorPatientAssignment: jest.fn(),
    createVitalSigns: jest.fn(),
    createDiagnosis: jest.fn(),
    findDiagnosisById: jest.fn(),
    softDeleteDiagnosis: jest.fn(),
    createProcedure: jest.fn(),
    findProcedureById: jest.fn(),
    softDeleteProcedure: jest.fn(),
  } as unknown as EncounterRepository;

  const authRepositoryMock = { findUserById: jest.fn() } as unknown as AuthRepository;
  const icd10CodeServiceMock = {
    findActiveIcd10CodeById: jest.fn(),
  } as unknown as Icd10CodeService;
  const icd9cmCodeServiceMock = {
    findActiveIcd9cmCodeById: jest.fn(),
  } as unknown as Icd9cmCodeService;

  const service = new EncounterClinicalDataService(
    encounterRepositoryMock,
    new EncounterAccessService(encounterRepositoryMock, authRepositoryMock),
    new EncounterMapper(),
    icd10CodeServiceMock,
    icd9cmCodeServiceMock,
  );

  const currentUser = { sub: '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8', email: 'admin@hms.local' };
  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const icd10CodeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const icd9cmCodeId = 'ffffffff-ffff-4fff-8fff-fffffffffff9';
  const timestamp = new Date('2026-07-20T08:00:00.000Z');

  const openEncounter = {
    id: encounterId,
    registrationId: '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001',
    patientId: '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002',
    doctorId: '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11',
    status: 'IN_PROGRESS' as const,
    startedAt: timestamp,
    endedAt: null,
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    createdById: currentUser.sub,
    createdAt: timestamp,
    updatedAt: timestamp,
    patient: {
      id: '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002',
      mrn: '00000001',
      fullName: 'Aisha Rahman',
      ownerUserId: null,
    },
    doctor: {
      id: '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11',
      licenseNumber: 'SIP-2026-0001',
      fullName: 'Dr. Budi Santoso',
      ownerUserId: null,
    },
    _count: { vitalSigns: 0, diagnoses: 0, procedures: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (authRepositoryMock.findUserById as jest.Mock).mockResolvedValue(
      buildActor([{ action: 'write', resource: 'Encounter', scope: 'ANY' }]),
    );
    (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(
      openEncounter,
    );
  });

  describe('recordVitalSigns', () => {
    it('appends a measurement set stamped with the recorder', async () => {
      (encounterRepositoryMock.createVitalSigns as jest.Mock).mockResolvedValue({
        id: 'vitals-1',
        encounterId,
        heightCm: 160,
        weightKg: 64,
        systolicBloodPressure: 118,
        diastolicBloodPressure: 76,
        pulseRate: null,
        respiratoryRate: null,
        temperatureCelsius: null,
        oxygenSaturation: null,
        notes: null,
        recordedAt: timestamp,
        recordedById: currentUser.sub,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const actual = await service.recordVitalSigns(
        encounterId,
        { heightCm: 160, weightKg: 64 } as RecordVitalSignsDto,
        currentUser,
      );

      expect(encounterRepositoryMock.createVitalSigns).toHaveBeenCalledWith(
        expect.objectContaining({ encounterId, recordedById: currentUser.sub }),
      );
      expect(actual.bodyMassIndex).toBe(25);
    });

    it('refuses to add vitals to a closed record', async () => {
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue({
        ...openEncounter,
        status: 'FINISHED',
      });

      await expect(
        service.recordVitalSigns(encounterId, { pulseRate: 80 } as RecordVitalSignsDto, currentUser),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reports a missing encounter as not found', async () => {
      (encounterRepositoryMock.findEncounterWithRelationsById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.recordVitalSigns(encounterId, { pulseRate: 80 } as RecordVitalSignsDto, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addDiagnosis', () => {
    it('snapshots code and display from the catalog rather than from the request', async () => {
      (icd10CodeServiceMock.findActiveIcd10CodeById as jest.Mock).mockResolvedValue({
        id: icd10CodeId,
        code: 'J06.9',
        display: 'Acute upper respiratory infection, unspecified',
        isActive: true,
      });
      (encounterRepositoryMock.createDiagnosis as jest.Mock).mockResolvedValue({
        id: 'diagnosis-1',
        encounterId,
        icd10CodeId,
        code: 'J06.9',
        display: 'Acute upper respiratory infection, unspecified',
        type: 'PRIMARY',
        notes: null,
        recordedAt: timestamp,
        recordedById: currentUser.sub,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await service.addDiagnosis(
        encounterId,
        {
          icd10CodeId,
          code: 'Z99.9',
          display: 'A display the client made up',
          type: 'PRIMARY',
        } as AddDiagnosisDto,
        currentUser,
      );

      expect(encounterRepositoryMock.createDiagnosis).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'J06.9',
          display: 'Acute upper respiratory infection, unspecified',
        }),
      );
    });

    it('rejects a retired or unknown catalog code', async () => {
      (icd10CodeServiceMock.findActiveIcd10CodeById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.addDiagnosis(
          encounterId,
          { icd10CodeId, type: 'PRIMARY' } as AddDiagnosisDto,
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a code the catalog does not carry when both fields are supplied', async () => {
      (encounterRepositoryMock.createDiagnosis as jest.Mock).mockResolvedValue({
        id: 'diagnosis-2',
        encounterId,
        icd10CodeId: null,
        code: 'U07.1',
        display: 'COVID-19, virus identified',
        type: 'SECONDARY',
        notes: null,
        recordedAt: timestamp,
        recordedById: currentUser.sub,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const actual = await service.addDiagnosis(
        encounterId,
        {
          code: 'U07.1',
          display: 'COVID-19, virus identified',
          type: 'SECONDARY',
        } as AddDiagnosisDto,
        currentUser,
      );

      expect(icd10CodeServiceMock.findActiveIcd10CodeById).not.toHaveBeenCalled();
      expect(actual.code).toBe('U07.1');
    });
  });

  describe('removeDiagnosis', () => {
    it('soft-deletes so the retraction stays auditable', async () => {
      (encounterRepositoryMock.findDiagnosisById as jest.Mock).mockResolvedValue({
        id: 'diagnosis-1',
        encounterId,
      });

      await service.removeDiagnosis(encounterId, 'diagnosis-1', currentUser);

      expect(encounterRepositoryMock.softDeleteDiagnosis).toHaveBeenCalledWith('diagnosis-1');
    });

    it('refuses a diagnosis belonging to another encounter', async () => {
      (encounterRepositoryMock.findDiagnosisById as jest.Mock).mockResolvedValue({
        id: 'diagnosis-1',
        encounterId: 'a-different-encounter',
      });

      await expect(
        service.removeDiagnosis(encounterId, 'diagnosis-1', currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(encounterRepositoryMock.softDeleteDiagnosis).not.toHaveBeenCalled();
    });
  });

  describe('addProcedure', () => {
    it('snapshots the ICD-9-CM catalog row', async () => {
      (icd9cmCodeServiceMock.findActiveIcd9cmCodeById as jest.Mock).mockResolvedValue({
        id: icd9cmCodeId,
        code: '93.94',
        display: 'Respiratory medication administered by nebulizer',
        isActive: true,
      });
      (encounterRepositoryMock.createProcedure as jest.Mock).mockResolvedValue({
        id: 'procedure-1',
        encounterId,
        icd9cmCodeId,
        code: '93.94',
        display: 'Respiratory medication administered by nebulizer',
        notes: null,
        performedAt: timestamp,
        recordedById: currentUser.sub,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const actual = await service.addProcedure(
        encounterId,
        { icd9cmCodeId } as AddProcedureDto,
        currentUser,
      );

      expect(actual.code).toBe('93.94');
    });
  });

  describe('removeProcedure', () => {
    it('soft-deletes the procedure', async () => {
      (encounterRepositoryMock.findProcedureById as jest.Mock).mockResolvedValue({
        id: 'procedure-1',
        encounterId,
      });

      await service.removeProcedure(encounterId, 'procedure-1', currentUser);

      expect(encounterRepositoryMock.softDeleteProcedure).toHaveBeenCalledWith('procedure-1');
    });
  });
});
