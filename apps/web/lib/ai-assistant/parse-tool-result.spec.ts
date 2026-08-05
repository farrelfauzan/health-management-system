import type { ChatToolResultView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { parseToolResult } from '#lib/ai-assistant/parse-tool-result';

describe('parseToolResult', () => {
  const mockStockResult = {
    medicationName: 'amoxicillin',
    matchCount: 1,
    items: [
      {
        medicationCode: 'MED-AMOX-500',
        medicationName: 'Amoxicillin',
        form: 'Kapsul',
        strength: '500 mg',
        unit: 'KAPSUL',
        stockQty: 35,
        reorderLevel: 40,
        needsReorder: true,
      },
    ],
  };

  function buildView(overrides: Partial<ChatToolResultView> = {}): ChatToolResultView {
    return {
      toolName: 'check_medication_stock',
      arguments: { medicationName: 'amoxicillin' },
      outcome: 'SUCCESS',
      result: mockStockResult,
      errorCode: null,
      ...overrides,
    };
  }

  it('narrows a stock lookup to its typed result', () => {
    const actual = parseToolResult(buildView());

    expect(actual).toEqual({ kind: 'STOCK', result: mockStockResult });
  });

  it('narrows an expiry lookup to its typed result', () => {
    const expiryResult = {
      asOfDate: '2026-08-02',
      throughDate: '2026-09-01',
      expiredCount: 1,
      expiringCount: 2,
      unknownExpiryCount: 0,
      matchCount: 3,
      items: [
        {
          medicationCode: 'MED-AMOX-500',
          medicationName: 'Amoxicillin',
          batchNumber: 'BATCH-A1',
          expiryDate: '2026-08-20',
          remainingQty: 60,
          expiryStatus: 'EXPIRING' as const,
          daysUntilExpiry: 18,
        },
      ],
    };

    const actual = parseToolResult(
      buildView({ toolName: 'check_medication_expiry', result: expiryResult }),
    );

    expect(actual).toEqual({ kind: 'EXPIRY', result: expiryResult });
  });

  it('narrows the three admin lookups to their typed results', () => {
    const queueResult = {
      date: '2026-08-04',
      waiting: 7,
      pending: 2,
      checkedIn: 3,
      completed: 11,
      cancelled: 1,
      poli: [
        { poliName: 'Poli Umum', waiting: 5, pending: 1, checkedIn: 2, completed: 8, cancelled: 1 },
      ],
    };
    const cashierResult = {
      date: '2026-08-04',
      paymentCount: 12,
      totalAmount: 1_850_000,
      byMethod: [{ method: 'CASH', count: 9, totalAmount: 1_250_000 }],
      byDoctor: [{ doctorName: 'dr. Siti', count: 6, totalAmount: 900_000 }],
    };
    const loadResult = {
      from: '2026-08-04',
      to: '2026-08-10',
      sessionCount: 2,
      totalBooked: 14,
      items: [
        {
          sessionDate: '2026-08-04',
          startTime: '08:00',
          endTime: '12:00',
          doctorName: 'dr. Siti',
          specialty: 'Umum',
          status: 'OPEN',
          maxPatients: 20,
          bookedCount: 9,
          remaining: 11,
        },
      ],
    };

    expect(
      parseToolResult(buildView({ toolName: 'get_queue_board_summary', result: queueResult })),
    ).toEqual({ kind: 'QUEUE', result: queueResult });
    expect(
      parseToolResult(buildView({ toolName: 'get_daily_cashier_report', result: cashierResult })),
    ).toEqual({ kind: 'CASHIER', result: cashierResult });
    expect(
      parseToolResult(buildView({ toolName: 'get_appointment_load', result: loadResult })),
    ).toEqual({ kind: 'APPOINTMENT_LOAD', result: loadResult });
  });

  it('keeps a failed lookup failed, carrying its typed code', () => {
    // §4.5: a refused lookup renders as refused. Turning it into an empty
    // table would read as "we checked, there is none".
    const actual = parseToolResult(
      buildView({ outcome: 'FAILED', result: null, errorCode: 'AI_TOOL_UNAVAILABLE' }),
    );

    expect(actual).toEqual({
      kind: 'FAILED',
      toolName: 'check_medication_stock',
      errorCode: 'AI_TOOL_UNAVAILABLE',
    });
  });

  it('refuses a payload that does not match the tool contract', () => {
    // A web/API version skew must surface as a visible notice, never as a
    // table quietly missing the column that moved.
    const actual = parseToolResult(buildView({ result: { items: 'not-an-array' } }));

    expect(actual).toEqual({ kind: 'UNRENDERABLE', toolName: 'check_medication_stock' });
  });

  it('refuses a tool this client has no renderer for', () => {
    const actual = parseToolResult(buildView({ toolName: 'list_my_patients', result: {} }));

    expect(actual).toEqual({ kind: 'UNRENDERABLE', toolName: 'list_my_patients' });
  });
});
