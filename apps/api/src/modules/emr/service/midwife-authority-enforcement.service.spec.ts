import { EncounterWithRelationsRecord } from '@hms/shared-types';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { DoctorAuthorityService } from '../../doctor-management/service/doctor-authority.service';
import { MidwifeAuthorityEnforcementService } from './midwife-authority-enforcement.service';

type ExceptionBody = { code?: string; errors?: { kind?: string } };

async function captureException(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (err) {
    return err;
  }
  throw new Error('Expected the action to throw');
}

function readBody(exception: unknown): ExceptionBody {
  expect(exception).toBeInstanceOf(UnprocessableEntityException);
  return (exception as UnprocessableEntityException).getResponse() as ExceptionBody;
}

describe('MidwifeAuthorityEnforcementService', () => {
  const hasActiveAuthorityMock = jest.fn();
  const recordMock = jest.fn();
  const doctorAuthorityServiceMock = {
    hasActiveAuthority: hasActiveAuthorityMock,
  } as unknown as DoctorAuthorityService;
  const auditServiceMock = { record: recordMock } as unknown as AuditService;
  const configServiceMock = { get: jest.fn(() => 'Asia/Jakarta') } as unknown as ConfigService;
  const service = new MidwifeAuthorityEnforcementService(
    doctorAuthorityServiceMock,
    auditServiceMock,
    configServiceMock,
  );
  const actorUserId = '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8';
  const midwifeId = '7c1f2f0a-2f4b-4d6a-9d0a-9c4e1f0b9c11';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const registrationId = '0d9b34a1-7c2f-4bd0-8a8e-6a3c1de1a001';
  const midwife = { id: midwifeId, ownerUserId: null, profession: 'MIDWIFE' as const };
  const doctor = { id: midwifeId, ownerUserId: null, profession: 'DOCTOR' as const };

  function buildEncounter(profession: 'DOCTOR' | 'MIDWIFE'): EncounterWithRelationsRecord {
    const timestamp = new Date('2026-09-15T01:00:00.000Z');
    return {
      id: 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01',
      registrationId,
      patientId,
      doctorId: midwifeId,
      status: 'IN_PROGRESS',
      startedAt: timestamp,
      endedAt: null,
      childVisitPurpose: null,
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      prognosis: null,
      createdById: actorUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      patient: { id: patientId, mrn: '00000001', fullName: 'Pasien Uji', ownerUserId: null },
      doctor: {
        id: midwifeId,
        licenseNumber: 'SIPB-2026-0001',
        fullName: 'Bidan Uji',
        ownerUserId: null,
        nikLast4: null,
        profession,
      },
      _count: { vitalSigns: 0, diagnoses: 0, procedures: 0 },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T03:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('assertProcedureAllowed', () => {
    it('refuses 69.7 for a midwife without IUD_IMPLANT, auditing before the 422', async () => {
      hasActiveAuthorityMock.mockResolvedValue(false);

      const actual = await captureException(() =>
        service.assertProcedureAllowed({
          encounter: buildEncounter('MIDWIFE'),
          code: '69.7',
          actorUserId,
        }),
      );

      expect(readBody(actual)).toEqual(
        expect.objectContaining({ code: 'MIDWIFE_AUTHORITY_REQUIRED', errors: { kind: 'IUD_IMPLANT' } }),
      );
      expect(hasActiveAuthorityMock).toHaveBeenCalledWith({
        doctorId: midwifeId,
        kind: 'IUD_IMPLANT',
        onDate: '2026-09-15',
      });
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MIDWIFE_AUTHORITY_REFUSED',
          metadata: {
            kind: 'IUD_IMPLANT',
            code: '69.7',
            encounterId: 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01',
            doctorId: midwifeId,
          },
        }),
      );
    });

    it('judges a backdated procedure on the clinic-local day it was performed', async () => {
      hasActiveAuthorityMock.mockResolvedValue(false);

      await captureException(() =>
        service.assertProcedureAllowed({
          encounter: buildEncounter('MIDWIFE'),
          code: '97.71',
          performedAt: new Date('2026-08-31T18:30:00.000Z'),
          actorUserId,
        }),
      );

      expect(hasActiveAuthorityMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'IUD_IMPLANT', onDate: '2026-09-01' }),
      );
    });

    it('allows a midwife with an active authority', async () => {
      hasActiveAuthorityMock.mockResolvedValue(true);

      await service.assertProcedureAllowed({
        encounter: buildEncounter('MIDWIFE'),
        code: '69.7',
        actorUserId,
      });

      expect(recordMock).not.toHaveBeenCalled();
    });

    it('never checks a doctor', async () => {
      await service.assertProcedureAllowed({
        encounter: buildEncounter('DOCTOR'),
        code: '69.7',
        contraceptiveImplantAction: 'INSERTION',
        actorUserId,
      });

      expect(hasActiveAuthorityMock).not.toHaveBeenCalled();
    });
  });

  describe('resolveChildVisitPurpose', () => {
    function resolve(params: {
      dateOfBirth: string;
      requestedPurpose?: 'WELL_CHILD' | 'NEONATAL_FIRST_AID' | 'SICK_CHILD';
      isMidwife?: boolean;
    }): Promise<string | null> {
      return service.resolveChildVisitPurpose({
        clinician: params.isMidwife === false ? doctor : midwife,
        patient: { id: patientId, dateOfBirth: new Date(`${params.dateOfBirth}T00:00:00.000Z`) },
        registrationId,
        requestedPurpose: params.requestedPurpose,
        actorUserId,
      });
    }

    it('requires a purpose for a child under 60 months', async () => {
      const actual = await captureException(() => resolve({ dateOfBirth: '2021-09-16' }));

      expect(readBody(actual).code).toBe('CHILD_VISIT_PURPOSE_REQUIRED');
    });

    it('ignores the purpose for a child of exactly 60 months', async () => {
      const actual = await resolve({ dateOfBirth: '2021-09-15', requestedPurpose: 'SICK_CHILD' });

      expect(actual).toBeNull();
      expect(hasActiveAuthorityMock).not.toHaveBeenCalled();
    });

    it('never asks a doctor, and stores null', async () => {
      const actual = await resolve({
        dateOfBirth: '2026-09-01',
        requestedPurpose: 'SICK_CHILD',
        isMidwife: false,
      });

      expect(actual).toBeNull();
      expect(hasActiveAuthorityMock).not.toHaveBeenCalled();
    });

    it('allows neonatal first aid at 28 days', async () => {
      const actual = await resolve({
        dateOfBirth: '2026-08-18',
        requestedPurpose: 'NEONATAL_FIRST_AID',
      });

      expect(actual).toBe('NEONATAL_FIRST_AID');
      expect(hasActiveAuthorityMock).not.toHaveBeenCalled();
    });

    it('refuses neonatal first aid at 29 days', async () => {
      const actual = await captureException(() =>
        resolve({ dateOfBirth: '2026-08-17', requestedPurpose: 'NEONATAL_FIRST_AID' }),
      );

      expect(readBody(actual).code).toBe('CHILD_VISIT_PURPOSE_INVALID');
    });

    it('opens a well-child visit without asking for MTBS', async () => {
      const actual = await resolve({ dateOfBirth: '2023-09-15', requestedPurpose: 'WELL_CHILD' });

      expect(actual).toBe('WELL_CHILD');
      expect(hasActiveAuthorityMock).not.toHaveBeenCalled();
    });

    it('refuses SICK_CHILD without MTBS, auditing the refusal', async () => {
      hasActiveAuthorityMock.mockResolvedValue(false);

      const actual = await captureException(() =>
        resolve({ dateOfBirth: '2023-09-15', requestedPurpose: 'SICK_CHILD' }),
      );

      expect(readBody(actual)).toEqual(
        expect.objectContaining({ code: 'MIDWIFE_AUTHORITY_REQUIRED', errors: { kind: 'MTBS' } }),
      );
      expect(hasActiveAuthorityMock).toHaveBeenCalledWith({
        doctorId: midwifeId,
        kind: 'MTBS',
        onDate: '2026-09-15',
      });
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MIDWIFE_AUTHORITY_REFUSED',
          metadata: expect.objectContaining({ kind: 'MTBS', registrationId }),
        }),
      );
    });

    it('allows SICK_CHILD with an active MTBS authority', async () => {
      hasActiveAuthorityMock.mockResolvedValue(true);

      const actual = await resolve({ dateOfBirth: '2023-09-15', requestedPurpose: 'SICK_CHILD' });

      expect(actual).toBe('SICK_CHILD');
      expect(recordMock).not.toHaveBeenCalled();
    });
  });
});
