import { describe, expect, it } from 'vitest';

import { buildDoctorsSearchParams, parseDoctorsSearchParams } from './search-params';

describe('doctors search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parseDoctorsSearchParams({
      page: '2',
      limit: '25',
      q: 'budi',
      specialty: 'cardio',
      active: 'true',
    });

    expect(parsed).toEqual({
      page: 2,
      limit: 25,
      search: 'budi',
      specialty: 'cardio',
      isActive: 'true',
    });
  });

  it('falls back to defaults when params are invalid', () => {
    const parsed = parseDoctorsSearchParams({ page: '0', active: 'nope' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('round-trips filters through build and parse', () => {
    const query = {
      page: 3,
      limit: 10,
      search: 'SIP-2026',
      specialty: 'Neurology',
      isActive: 'false' as const,
    };

    const params = buildDoctorsSearchParams(query);
    const raw = Object.fromEntries(params.entries());

    expect(parseDoctorsSearchParams(raw)).toEqual(query);
  });
});
