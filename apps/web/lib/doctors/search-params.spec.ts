import { describe, expect, it } from 'vitest';

import { buildDoctorsSearchParams, parseDoctorsSearchParams } from './search-params';

const SPECIALTY_ID = '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111';

describe('doctors search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parseDoctorsSearchParams({
      page: '2',
      limit: '25',
      q: 'budi',
      specialtyId: SPECIALTY_ID,
      active: 'true',
    });

    expect(parsed).toEqual({
      page: 2,
      limit: 25,
      search: 'budi',
      specialtyId: SPECIALTY_ID,
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
      specialtyId: SPECIALTY_ID,
      isActive: 'false' as const,
    };

    const params = buildDoctorsSearchParams(query);
    const raw = Object.fromEntries(params.entries());

    expect(parseDoctorsSearchParams(raw)).toEqual(query);
  });

  it('round-trips the missing-NIK filter', () => {
    const query = { page: 1, limit: 10, missingNik: 'true' as const };
    const raw = Object.fromEntries(buildDoctorsSearchParams(query).entries());

    expect(parseDoctorsSearchParams(raw)).toEqual(query);
  });

  it('drops a missing-NIK value that is not a boolean string', () => {
    const parsed = parseDoctorsSearchParams({ missingNik: 'maybe' });

    expect(parsed.missingNik).toBeUndefined();
  });
});
