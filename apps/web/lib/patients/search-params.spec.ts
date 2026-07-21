import { describe, expect, it } from 'vitest';

import { buildPatientsSearchParams, parsePatientsSearchParams } from './search-params';

describe('patients search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parsePatientsSearchParams({
      page: '2',
      limit: '25',
      q: 'aisha',
      status: 'IN_PATIENT',
      from: '2026-01-01',
      to: '2026-02-01',
    });

    expect(parsed).toEqual({
      page: 2,
      limit: 25,
      search: 'aisha',
      status: 'IN_PATIENT',
      createdFrom: '2026-01-01',
      createdTo: '2026-02-01',
    });
  });

  it('falls back to defaults when params are invalid', () => {
    const parsed = parsePatientsSearchParams({
      page: '0',
      status: 'NOT_A_STATUS',
    });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('round-trips filters through build and parse', () => {
    const query = {
      page: 3,
      limit: 10,
      search: 'MRN-2026',
      status: 'DISCHARGED' as const,
      createdFrom: '2026-03-01',
      createdTo: '2026-03-31',
    };

    const params = buildPatientsSearchParams(query);
    const raw = Object.fromEntries(params.entries());

    expect(parsePatientsSearchParams(raw)).toEqual(query);
  });

  it('omits empty filters from the query string', () => {
    const params = buildPatientsSearchParams({ page: 1, limit: 10 });

    expect(params.toString()).toBe('page=1&limit=10');
  });
});
