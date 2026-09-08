import type { LabOrderView, LabResultView } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildLabOrderHistory } from './build-lab-order-history';

const order: LabOrderView = {
  id: 'o1',
  orderNumber: 'LAB/20260907/0001',
  encounterId: 'e1',
  registrationId: 'r1',
  source: 'ENCOUNTER' as const,
  patientId: 'p1',
  orderedById: 'd1',
  orderedByName: 'dr. Andi Wijaya',
  status: 'RELEASED',
  priority: 'ROUTINE',
  isFasting: false,
  fulfilmentSite: 'INTERNAL',
  chargeMode: 'CLINIC',
  recollectCount: 0,
  orderedAt: '2026-09-07T00:00:00.000Z',
  releasedAt: '2026-09-07T04:00:00.000Z',
  items: [
    {
      id: 'i1',
      labTestId: 't1',
      code: 'HB',
      name: 'Hemoglobin',
      specimenType: 'WHOLE_BLOOD',
      resultType: 'NUMERIC',
      status: 'RESULTED',
    },
  ],
  specimens: [
    {
      id: 's1',
      labOrderId: 'o1',
      specimenType: 'WHOLE_BLOOD',
      accessionNumber: 'SPC/20260907/0001',
      collectedAt: '2026-09-07T01:00:00.000Z',
      collectedById: 'u1',
      receivedAt: '2026-09-07T01:30:00.000Z',
      status: 'RECEIVED',
    },
  ],
};

const results: LabResultView[] = [
  {
    id: 'r1',
    labOrderItemId: 'i1',
    version: 1,
    valueNumeric: 11.2,
    enteredById: 'u1',
    enteredAt: '2026-09-07T02:00:00.000Z',
    verifiedUnderSingleOperator: false,
  },
  {
    id: 'r2',
    labOrderItemId: 'i1',
    version: 2,
    valueNumeric: 12.1,
    enteredById: 'u2',
    enteredAt: '2026-09-07T05:00:00.000Z',
    verifiedUnderSingleOperator: true,
    amendedFromId: 'r1',
    amendReason: 'Salah ketik',
  },
];

describe('buildLabOrderHistory', () => {
  it('lists every timestamp on the record, newest first', () => {
    const actual = buildLabOrderHistory({ order, results });

    expect(actual.map((event) => event.kind)).toEqual([
      'AMENDED',
      'RELEASED',
      'ENTERED',
      'RECEIVED',
      'COLLECTED',
      'ORDERED',
    ]);
    expect(actual[0]?.values).toEqual({ test: 'Hemoglobin', version: 2 });
    expect(actual[5]?.values).toEqual({ actor: 'dr. Andi Wijaya' });
  });

  it('names the tube on a rejection', () => {
    const actual = buildLabOrderHistory({
      order: {
        ...order,
        specimens: [
          {
            ...order.specimens[0]!,
            status: 'REJECTED',
            rejectedAt: '2026-09-07T01:45:00.000Z',
            rejectReason: 'HEMOLYSED',
          },
        ],
      },
      results: [],
    });

    expect(actual.find((event) => event.kind === 'REJECTED')?.values).toEqual({
      accessionNumber: 'SPC/20260907/0001',
    });
  });
});
