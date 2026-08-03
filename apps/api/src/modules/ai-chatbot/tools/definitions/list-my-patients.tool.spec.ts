import { ForbiddenException } from '@nestjs/common';

import { AI_CHAT_TOOL_LIST_PAGE_LIMIT } from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { PatientManagementService } from '../../../patient-management/service/patient-management.service';
import { ListMyPatientsTool } from './list-my-patients.tool';

describe('ListMyPatientsTool', () => {
  const mockUser: CurrentUser = { sub: 'doctor-user-1', email: 'doctor@clinic.local' };

  /**
   * Deliberately richer than the allowlist, and richer than the projection is
   * today: `mrn`, `nikMasked`, `bpjsNumberMasked`, `phoneNumber` and a
   * `doctors[]` array naming other practitioners stand in for what a future
   * edit to the domain projection might add. None is named in the §4.3 output
   * schema, so none may survive.
   */
  function buildPatient(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      mrn: 'MRN00000042',
      fullName: 'Budi Santoso',
      nikMasked: '••••••••••••3456',
      bpjsNumberMasked: '••••••••7890',
      phoneNumber: '081234567890',
      address: 'Jl. Merdeka 17, Bandung',
      status: 'ACTIVE',
      isActive: true,
      doctorCount: 2,
      allergyCount: 1,
      doctors: [
        {
          id: 'doctor-2',
          assignmentId: 'assignment-1',
          fullName: 'dr. Siti Rahayu',
          specialty: 'Umum',
        },
      ],
      ...overrides,
    };
  }

  function buildTool(listPatients: jest.Mock): ListMyPatientsTool {
    return new ListMyPatientsTool({ listPatients } as unknown as PatientManagementService);
  }

  it('requires patient.read resolved to OWN, so an ANY-scoped actor is never offered it', () => {
    const actualTool = buildTool(jest.fn());

    // The registry treats an ANY grant as disqualifying for an OWN-scoped
    // requirement (§4.1.1 rule 2) — "the patients assigned to you" has no
    // meaning for someone who can read every patient.
    expect(actualTool.requiredPermission).toEqual({
      resource: 'Patient',
      action: 'read',
      scope: 'OWN',
    });
    expect(actualTool.channels).toEqual(['DOCTOR']);
    expect(actualTool.allowedRoleCodes).toEqual(['DOCTOR']);
  });

  it('calls the domain service as the asking user, capped at the list page limit', async () => {
    const mockListPatients = jest
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });

    await buildTool(mockListPatients).execute(mockUser, { page: 1 });

    // Passing CurrentUser is what makes the DoctorPatient assignment scoping
    // inherited rather than reimplemented — the tool is the same door.
    expect(mockListPatients).toHaveBeenCalledWith(
      { page: 1, limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT },
      mockUser,
    );
  });

  it('projects each row to three fields and drops every identifier', async () => {
    const mockListPatients = jest
      .fn()
      .mockResolvedValue({ items: [buildPatient()], meta: { page: 1, limit: 20, total: 44 } });

    const actualResult = await buildTool(mockListPatients).execute(mockUser, { page: 1 });

    expect(actualResult).toEqual({
      page: 1,
      matchCount: 44,
      items: [
        {
          patientId: '11111111-1111-4111-8111-111111111111',
          fullName: 'Budi Santoso',
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('cannot leak an identifier the backing service starts returning', async () => {
    // The allowlist's whole promise: a field added upstream is not copied,
    // so it cannot appear however the projection changes.
    const mockListPatients = jest.fn().mockResolvedValue({
      items: [buildPatient({ nik: '3273010101900001', bpjsNumber: '0001234567890' })],
      meta: { page: 1, limit: 20, total: 1 },
    });

    const actualResult = await buildTool(mockListPatients).execute(mockUser, { page: 1 });

    const serialized = JSON.stringify(actualResult);
    expect(serialized).not.toContain('3273010101900001');
    expect(serialized).not.toContain('0001234567890');
    expect(serialized).not.toContain('MRN00000042');
    expect(serialized).not.toContain('081234567890');
    expect(serialized).not.toContain('Jl. Merdeka');
    // Another practitioner's name is personal data about staff and answers
    // nothing this tool was asked.
    expect(serialized).not.toContain('dr. Siti Rahayu');
  });

  it('reports the total rather than the page length', async () => {
    const mockListPatients = jest.fn().mockResolvedValue({
      items: [buildPatient(), buildPatient({ id: 'patient-2', fullName: 'Ani Lestari' })],
      meta: { page: 2, limit: 20, total: 44 },
    });

    const actualResult = await buildTool(mockListPatients).execute(mockUser, { page: 2 });

    // A client must be able to say "2 of 44" rather than imply the page it
    // was handed is the whole answer.
    expect(actualResult).toMatchObject({ page: 2, matchCount: 44 });
    expect(actualResult.items).toHaveLength(2);
  });

  it('lets the domain service’s refusal through unchanged', async () => {
    const mockListPatients = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('You are not allowed to read patients'));

    // The dispatch loop turns this into a FAILED lookup with a typed code, so
    // the attempt stays visible in the transcript. Softening it here would
    // hide exactly what P15-T15 goes looking for.
    await expect(buildTool(mockListPatients).execute(mockUser, { page: 1 })).rejects.toThrow(
      ForbiddenException,
    );
  });
});
