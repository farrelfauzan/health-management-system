import { UnprocessableEntityException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { DoctorAuthorityService } from '../../doctor-management/service/doctor-authority.service';
import { DoctorMandateService } from '../../doctor-management/service/doctor-mandate.service';
import { FamilyPlanningRepository } from '../repository/family-planning.repository';
import { FamilyPlanningAuthorityService } from './family-planning-authority.service';

/**
 * P25-T14. A midwife starting an IUD or implant needs IUD_IMPLANT — or, for an
 * IUD, a mandate naming 69.7 — and a refusal is audited before the 422.
 */
describe('FamilyPlanningAuthorityService (P25-T14)', () => {
  const MIDWIFE_ID = '58e9a316-40b2-4f4c-9207-2a58028babc4';
  const PATIENT_ID = '4a9b2c71-8e35-4d02-a6f7-3b0c9d18e5a4';
  const repositoryMock = { findProvider: jest.fn() };
  const hasActiveAuthorityMock = jest.fn();
  const findCoveringMandateMock = jest.fn();
  const auditRecordMock = jest.fn();
  const service = new FamilyPlanningAuthorityService(
    repositoryMock as unknown as FamilyPlanningRepository,
    { hasActiveAuthority: hasActiveAuthorityMock } as unknown as DoctorAuthorityService,
    { findCoveringMandate: findCoveringMandateMock } as unknown as DoctorMandateService,
    { record: auditRecordMock } as unknown as AuditService,
  );

  function buildParams(method: 'IUD' | 'IMPLANT' | 'INJECTABLE_3_MONTH') {
    return {
      method,
      providerDoctorId: MIDWIFE_ID,
      startedOn: '2026-10-01',
      patientId: PATIENT_ID,
      actorUserId: 'user-1',
    };
  }

  function readBody(error: unknown): Record<string, unknown> {
    return (error as UnprocessableEntityException).getResponse() as Record<string, unknown>;
  }

  beforeEach(() => {
    jest.resetAllMocks();
    repositoryMock.findProvider.mockResolvedValue({ id: MIDWIFE_ID, profession: 'MIDWIFE' });
  });

  it('refuses a midwife an IUD without authority or mandate: audit, then 422 IUD_IMPLANT', async () => {
    hasActiveAuthorityMock.mockResolvedValue(false);
    findCoveringMandateMock.mockResolvedValue(null);
    const actualError = await service.resolveMethodMandate(buildParams('IUD')).catch((err) => err);
    expect(actualError).toBeInstanceOf(UnprocessableEntityException);
    expect(readBody(actualError)).toEqual(
      expect.objectContaining({ code: 'MIDWIFE_AUTHORITY_REQUIRED', errors: { kind: 'IUD_IMPLANT' } }),
    );
    expect(hasActiveAuthorityMock).toHaveBeenCalledWith({
      doctorId: MIDWIFE_ID,
      kind: 'IUD_IMPLANT',
      onDate: '2026-10-01',
    });
    expect(findCoveringMandateMock).toHaveBeenCalledWith(
      expect.objectContaining({ midwifeDoctorId: MIDWIFE_ID, icd9cmCode: '69.7' }),
    );
    expect(auditRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MIDWIFE_AUTHORITY_REFUSED',
        patientId: PATIENT_ID,
        metadata: expect.objectContaining({ kind: 'IUD_IMPLANT', method: 'IUD' }),
      }),
    );
  });

  it('lets a midwife with IUD_IMPLANT start an IUD in her own right', async () => {
    hasActiveAuthorityMock.mockResolvedValue(true);
    await expect(service.resolveMethodMandate(buildParams('IUD'))).resolves.toBeNull();
    expect(findCoveringMandateMock).not.toHaveBeenCalled();
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('lets a mandate naming 69.7 cover an IUD and returns its id', async () => {
    hasActiveAuthorityMock.mockResolvedValue(false);
    findCoveringMandateMock.mockResolvedValue({ id: 'mandate-1' });
    await expect(service.resolveMethodMandate(buildParams('IUD'))).resolves.toBe('mandate-1');
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('never looks for a mandate for an implant, which no ICD-9-CM code names', async () => {
    hasActiveAuthorityMock.mockResolvedValue(false);
    const actualError = await service
      .resolveMethodMandate(buildParams('IMPLANT'))
      .catch((err) => err);
    expect(readBody(actualError).code).toBe('MIDWIFE_AUTHORITY_REQUIRED');
    expect(findCoveringMandateMock).not.toHaveBeenCalled();
  });

  it('does not gate an injectable, nor a doctor', async () => {
    await expect(service.resolveMethodMandate(buildParams('INJECTABLE_3_MONTH'))).resolves.toBeNull();
    repositoryMock.findProvider.mockResolvedValue({ id: 'doctor-1', profession: 'DOCTOR' });
    await expect(service.resolveMethodMandate(buildParams('IUD'))).resolves.toBeNull();
    expect(hasActiveAuthorityMock).not.toHaveBeenCalled();
  });
});
