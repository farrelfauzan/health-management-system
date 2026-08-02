import { ForbiddenException } from '@nestjs/common';

import { AI_CHAT_TOOL_LIST_PAGE_LIMIT } from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { PharmacyFlowService } from '../../../pharmacy-flow/service/pharmacy-flow.service';
import { CheckMedicationStockTool } from './check-medication-stock.tool';

describe('CheckMedicationStockTool', () => {
  const mockUser: CurrentUser = { sub: 'doctor-user-1', email: 'doctor@clinic.local' };

  /**
   * Deliberately richer than the allowlist: `id`, `kfaCode`, `dphoCode`,
   * `category`, and the row timestamps are what the backing service really
   * returns, and none of them are named in the §4.3 output schema.
   */
  function buildMedication(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'AMOX500',
      kfaCode: '93000123',
      dphoCode: 'DPHO-77',
      name: 'Amoxicillin 500mg',
      form: 'CAPSULE',
      strength: '500 mg',
      unit: 'TABLET',
      category: 'ANTIBIOTIC',
      stockQty: 120,
      reorderLevel: 50,
      needsReorder: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function buildTool(listMedications: jest.Mock): CheckMedicationStockTool {
    return new CheckMedicationStockTool({
      listMedications,
    } as unknown as PharmacyFlowService);
  }

  it('requires the medication.read:any grant a DOCTOR actually holds', () => {
    // The tool is the same door as GET /api/v1/medications, which is behind
    // `Medication:read` — the grant seed.sql gives DOCTOR.
    const actualTool = buildTool(jest.fn());

    expect(actualTool.requiredPermission).toEqual({
      resource: 'Medication',
      action: 'read',
      scope: 'ANY',
    });
    expect(actualTool.channels).toEqual(['DOCTOR']);
    expect(actualTool.allowedRoleCodes).toEqual(['DOCTOR']);
  });

  it('searches by the requested name as the asking user, capped at the list page limit', async () => {
    const mockListMedications = jest
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });

    await buildTool(mockListMedications).execute(mockUser, { medicationName: 'amoxicillin' });

    expect(mockListMedications).toHaveBeenCalledWith(
      { page: 1, limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT, search: 'amoxicillin' },
      mockUser,
    );
  });

  it('omits the search filter when no name was given', async () => {
    const mockListMedications = jest
      .fn()
      .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } });

    const actualResult = await buildTool(mockListMedications).execute(mockUser, {});

    expect(mockListMedications).toHaveBeenCalledWith(
      { page: 1, limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT },
      mockUser,
    );
    expect(actualResult).toEqual({ medicationName: null, matchCount: 0, items: [] });
  });

  it('copies only the allowlisted fields out of the service response', async () => {
    const mockListMedications = jest.fn().mockResolvedValue({
      items: [buildMedication()],
      meta: { page: 1, limit: 20, total: 1 },
    });

    const actualResult = await buildTool(mockListMedications).execute(mockUser, {
      medicationName: 'amoxicillin',
    });

    expect(actualResult).toEqual({
      medicationName: 'amoxicillin',
      matchCount: 1,
      items: [
        {
          medicationCode: 'AMOX500',
          medicationName: 'Amoxicillin 500mg',
          form: 'CAPSULE',
          strength: '500 mg',
          unit: 'TABLET',
          stockQty: 120,
          reorderLevel: 50,
          needsReorder: false,
        },
      ],
    });
  });

  it('drops an identifier the backing service starts returning', async () => {
    // §4.3 fails closed: a field nobody listed cannot appear, so a future
    // edit widening the medication projection cannot leak through a tool.
    const mockListMedications = jest.fn().mockResolvedValue({
      items: [buildMedication({ nik: '3204010101900001', supplierContact: '+628123456789' })],
      meta: { page: 1, limit: 20, total: 1 },
    });

    const actualResult = await buildTool(mockListMedications).execute(mockUser, {});

    expect(JSON.stringify(actualResult)).not.toContain('3204010101900001');
    expect(JSON.stringify(actualResult)).not.toContain('supplierContact');
  });

  it('reports the total match count, not the size of the capped page', async () => {
    // "20 of 44" must stay sayable: implying the page is the whole answer is
    // exactly the confident wrongness Mode A exists to avoid.
    const mockListMedications = jest.fn().mockResolvedValue({
      items: Array.from({ length: AI_CHAT_TOOL_LIST_PAGE_LIMIT }, (_unused, index) =>
        buildMedication({ code: `MED${index}`, name: `Medication ${index}` }),
      ),
      meta: { page: 1, limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT, total: 44 },
    });

    const actualResult = await buildTool(mockListMedications).execute(mockUser, {});

    expect(actualResult.matchCount).toBe(44);
    expect(actualResult.items).toHaveLength(AI_CHAT_TOOL_LIST_PAGE_LIMIT);
  });

  it('propagates a domain-service refusal instead of answering', async () => {
    // The dispatch loop turns this into a FAILED lookup (§4.5); what must
    // never happen is a tool inventing an answer the service refused.
    const mockListMedications = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('You are not allowed to read medications'));

    await expect(buildTool(mockListMedications).execute(mockUser, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
