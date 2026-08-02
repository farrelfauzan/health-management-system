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
