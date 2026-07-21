import { describe, expect, it } from 'vitest';

import { buildRegistrationsSearchParams, parseRegistrationsSearchParams } from './search-params';

describe('registrations search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parseRegistrationsSearchParams({
      page: '2',
      limit: '25',
      q: 'MRN-0001',
      status: 'CHECKED_IN',
      from: '2026-07-01',
      to: '2026-07-18',
    });

    expect(parsed).toEqual({
      page: 2,
      limit: 25,
      search: 'MRN-0001',
      status: 'CHECKED_IN',
      registeredFrom: '2026-07-01',
      registeredTo: '2026-07-18',
    });
  });

  it('falls back to defaults when params are invalid', () => {
    const parsed = parseRegistrationsSearchParams({ page: '0', status: 'UNKNOWN' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('falls back to defaults when the date range is inverted', () => {
    const parsed = parseRegistrationsSearchParams({ from: '2026-07-18', to: '2026-07-01' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('round-trips filters through build and parse', () => {
    const query = {
      page: 3,
      limit: 10,
      search: 'Siti',
      status: 'PENDING' as const,
      registeredFrom: '2026-07-01',
      registeredTo: '2026-07-21',
    };

    const params = buildRegistrationsSearchParams(query);
    const raw = Object.fromEntries(params.entries());

    expect(parseRegistrationsSearchParams(raw)).toEqual(query);
  });
});
