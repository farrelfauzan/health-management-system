import { AI_CHAT_TOOL_EXPIRY_DEFAULT_DAYS, AI_CHAT_TOOL_LIST_PAGE_LIMIT } from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { PharmacyFlowService } from '../../../pharmacy-flow/service/pharmacy-flow.service';
import { CheckMedicationExpiryTool } from './check-medication-expiry.tool';

describe('CheckMedicationExpiryTool', () => {
  const mockUser: CurrentUser = { sub: 'doctor-user-1', email: 'doctor@clinic.local' };

  /**
   * The real `ExpiryReportItemResponse` shape: a stock receipt plus expiry
   * fields. `receivedById` is a staff user id and `notes` is free text —
   * neither is named in the §4.3 allowlist, so neither may survive.
   */
  function buildExpiryItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: '22222222-2222-4222-8222-222222222222',
      medicationId: '11111111-1111-4111-8111-111111111111',
      medicationCode: 'AMOX500',
      medicationName: 'Amoxicillin 500mg',
      batchNumber: 'BATCH-A1',
      expiryDate: '2026-08-20',
      quantity: 100,
      allocatedQty: 40,
      remainingQty: 60,
      receivedAt: '2026-02-01T02:00:00.000Z',
      receivedById: '33333333-3333-4333-8333-333333333333',
      notes: 'Diterima oleh Apoteker Rina, suhu ruang',
      createdAt: '2026-02-01T02:00:00.000Z',
      expiryStatus: 'EXPIRING',
      daysUntilExpiry: 18,
      ...overrides,
    };
  }

  function buildTool(getExpiryReport: jest.Mock): CheckMedicationExpiryTool {
    return new CheckMedicationExpiryTool({
      getExpiryReport,
    } as unknown as PharmacyFlowService);
  }

  function buildReport(items: Array<Record<string, unknown>>): Record<string, unknown> {
    return { asOfDate: '2026-08-02', throughDate: '2026-09-01', items };
  }

  it('requires inventory.read:any — what the backing service enforces, not what the table said', () => {
    // ai-chatbot-tools.md §2.1.1 listed medication.read:any for this tool,
    // but `getExpiryReport` asserts `Inventory:read`, which DOCTOR does not
    // hold in seed.sql. Declaring the real requirement means the tool is not
    // offered rather than offered and then refused downstream.
    const actualTool = buildTool(jest.fn());

    expect(actualTool.requiredPermission).toEqual({
      resource: 'Inventory',
      action: 'read',
      scope: 'ANY',
    });
  });

  it('applies the schema default when the model omits the window', async () => {
    const mockGetExpiryReport = jest.fn().mockResolvedValue(buildReport([]));

    await buildTool(mockGetExpiryReport).execute(mockUser, {});

    expect(mockGetExpiryReport).toHaveBeenCalledWith(
      { days: AI_CHAT_TOOL_EXPIRY_DEFAULT_DAYS },
      mockUser,
    );
  });

  it('forwards the requested window as the asking user', async () => {
    const mockGetExpiryReport = jest.fn().mockResolvedValue(buildReport([]));

    await buildTool(mockGetExpiryReport).execute(mockUser, { days: 7 });

    expect(mockGetExpiryReport).toHaveBeenCalledWith({ days: 7 }, mockUser);
  });

  it('accepts a zero window as "only what has already expired"', async () => {
    const mockGetExpiryReport = jest.fn().mockResolvedValue(buildReport([]));

    await buildTool(mockGetExpiryReport).execute(mockUser, { days: 0 });

    // "Obat apa yang sudah kadaluarsa" is the question this tool exists for,
    // and no look-ahead is how a model states it — refusing 0 as invalid
    // made that question unanswerable.
    expect(mockGetExpiryReport).toHaveBeenCalledWith({ days: 0 }, mockUser);
  });

  it('drops the staff identifier and the free-text note from every batch line', async () => {
    const mockGetExpiryReport = jest.fn().mockResolvedValue(buildReport([buildExpiryItem()]));

    const actualResult = await buildTool(mockGetExpiryReport).execute(mockUser, { days: 30 });

    expect(actualResult.items).toEqual([
      {
        medicationCode: 'AMOX500',
        medicationName: 'Amoxicillin 500mg',
        batchNumber: 'BATCH-A1',
        expiryDate: '2026-08-20',
        remainingQty: 60,
        expiryStatus: 'EXPIRING',
        daysUntilExpiry: 18,
      },
    ]);
    expect(JSON.stringify(actualResult)).not.toContain('33333333-3333-4333-8333-333333333333');
    expect(JSON.stringify(actualResult)).not.toContain('Apoteker Rina');
  });

  it('renders a legacy unknown-expiry batch as unknown rather than guessing a date', async () => {
    const mockGetExpiryReport = jest.fn().mockResolvedValue(
      buildReport([
        buildExpiryItem({
          expiryDate: undefined,
          daysUntilExpiry: undefined,
          expiryStatus: 'UNKNOWN',
        }),
      ]),
    );

    const actualResult = await buildTool(mockGetExpiryReport).execute(mockUser, { days: 30 });

    expect(actualResult.items[0]).toEqual({
      medicationCode: 'AMOX500',
      medicationName: 'Amoxicillin 500mg',
      batchNumber: 'BATCH-A1',
      remainingQty: 60,
      expiryStatus: 'UNKNOWN',
    });
    expect(actualResult.unknownExpiryCount).toBe(1);
  });

  it('counts every status over the whole report, then caps the rendered batches', async () => {
    // The cap bounds what is rendered, never what is counted: "22 expiring"
    // must stay true when only the first twenty lines come back.
    const expiringBatches = Array.from({ length: 22 }, (_unused, index) =>
      buildExpiryItem({ batchNumber: `BATCH-${index}` }),
    );
    const mockGetExpiryReport = jest.fn().mockResolvedValue(
      buildReport([
        ...expiringBatches,
        buildExpiryItem({ expiryStatus: 'EXPIRED', daysUntilExpiry: -4 }),
        buildExpiryItem({ expiryStatus: 'UNKNOWN', expiryDate: undefined }),
      ]),
    );

    const actualResult = await buildTool(mockGetExpiryReport).execute(mockUser, { days: 30 });

    expect(actualResult).toMatchObject({
      asOfDate: '2026-08-02',
      throughDate: '2026-09-01',
      expiredCount: 1,
      expiringCount: 22,
      unknownExpiryCount: 1,
      matchCount: 24,
    });
    expect(actualResult.items).toHaveLength(AI_CHAT_TOOL_LIST_PAGE_LIMIT);
  });
});
