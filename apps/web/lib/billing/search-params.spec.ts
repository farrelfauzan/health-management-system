import { describe, expect, it } from 'vitest';

import { buildInvoicesSearchParams, parseInvoicesSearchParams } from './search-params';

describe('invoices search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parseInvoicesSearchParams({
      page: '2',
      limit: '25',
      status: 'ISSUED',
      patient: '0d2f0f2e-1b6a-4a5f-8f3f-4d7e1f0b9c11',
      from: '2026-07-01',
      to: '2026-07-18',
    });

    expect(parsed).toEqual({
      page: 2,
      limit: 25,
      status: 'ISSUED',
      patientId: '0d2f0f2e-1b6a-4a5f-8f3f-4d7e1f0b9c11',
      encounterId: undefined,
      createdFrom: '2026-07-01',
      createdTo: '2026-07-18',
    });
  });

  it('falls back to defaults when the status is not a real invoice state', () => {
    const parsed = parseInvoicesSearchParams({ status: 'REFUNDED' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('rejects a reversed date range rather than silently swapping it', () => {
    const parsed = parseInvoicesSearchParams({ from: '2026-07-18', to: '2026-07-01' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('round-trips a query back into url params', () => {
    const params = buildInvoicesSearchParams({ page: 3, limit: 10, status: 'PAID' });

    expect(params.get('page')).toBe('3');
    expect(params.get('status')).toBe('PAID');
    expect(params.get('patient')).toBeNull();
  });
});
