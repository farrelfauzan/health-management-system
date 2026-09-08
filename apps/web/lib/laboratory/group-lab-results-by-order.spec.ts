import type { PatientLabResultView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { groupLabResultsByOrder } from './group-lab-results-by-order';

function buildResult(overrides: Partial<PatientLabResultView> = {}): PatientLabResultView {
  return {
    id: 'result-1',
    labOrderItemId: 'item-1',
    version: 1,
    valueNumeric: 13.2,
    unit: 'g/dL',
    flag: 'NORMAL',
    enteredById: 'analyst-1',
    enteredAt: '2026-07-28T03:00:00.000Z',
    verifiedUnderSingleOperator: false,
    labOrderId: 'order-1',
    orderNumber: 'LAB/20260728/0001',
    testCode: 'HB',
    testName: 'Hemoglobin',
    resultType: 'NUMERIC',
    ...overrides,
  };
}

describe('groupLabResultsByOrder', () => {
  it('keeps the values of one request together under its number', () => {
    const actualGroups = groupLabResultsByOrder([
      buildResult(),
      buildResult({ id: 'result-2', testCode: 'GDS', testName: 'Glukosa' }),
    ]);

    expect(actualGroups).toHaveLength(1);
    expect(actualGroups[0]?.orderNumber).toBe('LAB/20260728/0001');
    expect(actualGroups[0]?.results).toHaveLength(2);
  });

  it('keeps two requests apart even when they share a day', () => {
    const actualGroups = groupLabResultsByOrder([
      buildResult(),
      buildResult({
        id: 'result-2',
        labOrderId: 'order-2',
        orderNumber: 'LAB/20260728/0002',
      }),
    ]);

    expect(actualGroups.map((group) => group.orderNumber)).toEqual([
      'LAB/20260728/0001',
      'LAB/20260728/0002',
    ]);
  });

  it('preserves the order the API returned', () => {
    const actualGroups = groupLabResultsByOrder([
      buildResult({ labOrderId: 'order-2', orderNumber: 'LAB/20260728/0002' }),
      buildResult({ id: 'result-2' }),
    ]);

    expect(actualGroups[0]?.orderNumber).toBe('LAB/20260728/0002');
  });
});
