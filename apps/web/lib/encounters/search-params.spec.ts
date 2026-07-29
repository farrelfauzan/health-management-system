import { describe, expect, it } from 'vitest';

import { buildEncountersSearchParams, parseEncountersSearchParams } from './search-params';

describe('encounters search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parseEncountersSearchParams({
      page: '3',
      limit: '25',
      status: 'IN_PROGRESS',
      doctor: '0d2f0f2e-1b6a-4a5f-8f3f-4d7e1f0b9c11',
      from: '2026-07-01',
      to: '2026-07-18',
    });

    expect(parsed).toEqual({
      page: 3,
      limit: 25,
      status: 'IN_PROGRESS',
      patientId: undefined,
      doctorId: '0d2f0f2e-1b6a-4a5f-8f3f-4d7e1f0b9c11',
      registrationId: undefined,
      startedFrom: '2026-07-01',
      startedTo: '2026-07-18',
    });
  });

  it('falls back to defaults when the query is invalid', () => {
    const parsed = parseEncountersSearchParams({ status: 'ARCHIVED', page: '0' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('rejects a reversed date range rather than silently swapping it', () => {
    const parsed = parseEncountersSearchParams({ from: '2026-07-18', to: '2026-07-01' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('round-trips a query back into url params', () => {
    const params = buildEncountersSearchParams({
      page: 2,
      limit: 10,
      status: 'FINISHED',
      registrationId: 'b0b3ec5a-cf6c-4d5c-9c25-19d9a0d8f0aa',
    });

    expect(params.get('page')).toBe('2');
    expect(params.get('status')).toBe('FINISHED');
    expect(params.get('registration')).toBe('b0b3ec5a-cf6c-4d5c-9c25-19d9a0d8f0aa');
    expect(params.get('doctor')).toBeNull();
  });
});
