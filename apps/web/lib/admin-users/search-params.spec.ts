import { describe, expect, it } from 'vitest';

import { buildAdminUsersSearchParams, parseAdminUsersSearchParams } from './search-params';

describe('admin users search params', () => {
  it('parses url params into a validated query', () => {
    const parsed = parseAdminUsersSearchParams({
      page: '2',
      limit: '25',
      q: 'admin@',
      role: 'ADMIN',
      active: 'true',
    });

    expect(parsed).toEqual({
      page: 2,
      limit: 25,
      search: 'admin@',
      roleCode: 'ADMIN',
      isActive: 'true',
    });
  });

  it('falls back to defaults when params are invalid', () => {
    const parsed = parseAdminUsersSearchParams({ page: '0', active: 'nope' });

    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('round-trips filters through build and parse', () => {
    const query = {
      page: 3,
      limit: 10,
      search: 'hms.local',
      roleCode: 'SUPER_ADMIN',
      isActive: 'false' as const,
    };

    const params = buildAdminUsersSearchParams(query);
    const raw = Object.fromEntries(params.entries());

    expect(parseAdminUsersSearchParams(raw)).toEqual(query);
  });
});
