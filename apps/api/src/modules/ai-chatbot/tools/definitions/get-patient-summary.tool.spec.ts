import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { PatientManagementService } from '../../../patient-management/service/patient-management.service';
import { GetPatientSummaryTool } from './get-patient-summary.tool';

describe('GetPatientSummaryTool', () => {
  const mockUser: CurrentUser = { sub: 'doctor-user-1', email: 'doctor@clinic.local' };
  const PATIENT_ID = '11111111-1111-4111-8111-111111111111';

  /**
   * The full `getPatientById` shape, which is the point: every identifier and
   * contact field the real service returns is present here so the assertions
   * below are about the allowlist rather than about a convenient fixture.
   */
  function buildPatient(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: PATIENT_ID,
      mrn: 'MRN00000042',
      fullName: 'Budi Santoso',
      dateOfBirth: '1990-01-01',
      placeOfBirth: 'Bandung',
      sex: 'MALE',
      status: 'ACTIVE',
      phoneNumber: '081234567890',
      address: 'Jl. Merdeka 17, Bandung',
      nikMasked: '••••••••••••3456',
      bpjsNumberMasked: '••••••••7890',
      hasSatusehatPatientId: true,
      email: 'budi@example.com',
      bloodType: 'O',
      rhesusFactor: 'POSITIVE',
      maritalStatus: 'MARRIED',
      occupation: 'Guru',
      religion: 'ISLAM',
      emergencyContactName: 'Ani Santoso',
      emergencyContactPhone: '081298765432',
      guardianName: 'Ani Santoso',
      guardianRelation: 'SPOUSE',
      ownerUserId: 'user-99',
      isActive: true,
      lastVisitAt: '2026-07-20T02:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2026-07-20T02:00:00.000Z',
      doctors: [
        { id: 'doctor-1', assignmentId: 'a-1', fullName: 'dr. Siti', specialty: 'Umum' },
        { id: 'doctor-2', assignmentId: 'a-2', fullName: 'dr. Joko', specialty: 'Anak' },
      ],
      allergies: [
        {
          id: 'allergy-1',
          substance: 'Penicillin',
          reaction: 'Ruam luas dan sesak setelah dosis kedua pada 2024',
          severity: 'SEVERE',
          createdAt: '2025-02-01T00:00:00.000Z',
          updatedAt: '2025-02-01T00:00:00.000Z',
        },
      ],
      ...overrides,
    };
  }

  function buildTool(getPatientById: jest.Mock): GetPatientSummaryTool {
    return new GetPatientSummaryTool({ getPatientById } as unknown as PatientManagementService);
  }

  it('requires patient.read resolved to OWN', () => {
    expect(buildTool(jest.fn()).requiredPermission).toEqual({
      resource: 'Patient',
      action: 'read',
      scope: 'OWN',
    });
  });

  it('reads through the domain service as the asking user', async () => {
    const mockGetPatientById = jest.fn().mockResolvedValue(buildPatient());

    await buildTool(mockGetPatientById).execute(mockUser, { patientId: PATIENT_ID });

    expect(mockGetPatientById).toHaveBeenCalledWith(PATIENT_ID, mockUser);
  });

  it('drops every identifier and contact field the service returns', async () => {
    const mockGetPatientById = jest.fn().mockResolvedValue(buildPatient());

    const actualResult = await buildTool(mockGetPatientById).execute(mockUser, {
      patientId: PATIENT_ID,
    });

    const serialized = JSON.stringify(actualResult);
    // The masked identifiers go too. Minimisation is about whether a field is
    // needed to answer, not about how readable it is.
    expect(serialized).not.toContain('MRN00000042');
    expect(serialized).not.toContain('3456');
    expect(serialized).not.toContain('7890');
    expect(serialized).not.toContain('081234567890');
    expect(serialized).not.toContain('Jl. Merdeka');
    expect(serialized).not.toContain('budi@example.com');
    expect(serialized).not.toContain('Ani Santoso');
    expect(serialized).not.toContain('user-99');
    expect(serialized).not.toContain('Bandung');
  });

  it('cannot leak a raw identifier a future projection edit adds', async () => {
    const mockGetPatientById = jest
      .fn()
      .mockResolvedValue(
        buildPatient({ nik: '3273010101900001', bpjsNumber: '0001234567890', notes: 'SOAP' }),
      );

    const actualResult = await buildTool(mockGetPatientById).execute(mockUser, {
      patientId: PATIENT_ID,
    });

    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('3273010101900001');
    expect(serialized).not.toContain('0001234567890');
    expect(serialized).not.toContain('SOAP');
  });

  it('reports age in years and never the birth date it came from', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    const mockGetPatientById = jest.fn().mockResolvedValue(buildPatient());

    const actualResult = await buildTool(mockGetPatientById).execute(mockUser, {
      patientId: PATIENT_ID,
    });

    expect(actualResult.ageYears).toBe(36);
    expect(JSON.stringify(actualResult)).not.toContain('1990-01-01');
    jest.useRealTimers();
  });

  it('omits age rather than guessing when the birth date is absent or unusable', async () => {
    const mockAbsent = jest.fn().mockResolvedValue(buildPatient({ dateOfBirth: undefined }));
    const mockUnparseable = jest.fn().mockResolvedValue(buildPatient({ dateOfBirth: 'unknown' }));

    const absentResult = await buildTool(mockAbsent).execute(mockUser, { patientId: PATIENT_ID });
    const unparseableResult = await buildTool(mockUnparseable).execute(mockUser, {
      patientId: PATIENT_ID,
    });

    // "age 0" and "age unknown" are different clinical facts.
    expect(absentResult.ageYears).toBeUndefined();
    expect(unparseableResult.ageYears).toBeUndefined();
  });

  it('keeps the coded allergy and drops its free-text reaction', async () => {
    const mockGetPatientById = jest.fn().mockResolvedValue(buildPatient());

    const actualResult = await buildTool(mockGetPatientById).execute(mockUser, {
      patientId: PATIENT_ID,
    });

    expect(actualResult.allergies).toEqual([{ substance: 'Penicillin', severity: 'SEVERE' }]);
    expect(actualResult.allergyCount).toBe(1);
    // §8's line on free-text clinical narrative applies to an allergy note
    // exactly as it applies to a SOAP note.
    expect(JSON.stringify(actualResult)).not.toContain('Ruam luas');
  });

  it('counts assigned doctors without naming any of them', async () => {
    const mockGetPatientById = jest.fn().mockResolvedValue(buildPatient());

    const actualResult = await buildTool(mockGetPatientById).execute(mockUser, {
      patientId: PATIENT_ID,
    });

    expect(actualResult.assignedDoctorCount).toBe(2);
    expect(JSON.stringify(actualResult)).not.toContain('dr. Siti');
    expect(JSON.stringify(actualResult)).not.toContain('dr. Joko');
  });

  it('lets a not-assigned refusal through as the domain service raised it', async () => {
    const mockGetPatientById = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('You are not allowed to read this patient'));

    // A doctor reaching for another doctor's patient must fail exactly as the
    // REST route fails, and the attempt must stay visible in the transcript.
    await expect(
      buildTool(mockGetPatientById).execute(mockUser, { patientId: PATIENT_ID }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a missing patient through as not found', async () => {
    const mockGetPatientById = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Patient not found'));

    await expect(
      buildTool(mockGetPatientById).execute(mockUser, { patientId: PATIENT_ID }),
    ).rejects.toThrow(NotFoundException);
  });
});
