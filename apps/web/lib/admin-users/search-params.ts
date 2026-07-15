import { listUsersQuerySchema } from '@hms/shared-types';

export type AdminCapabilityMode = 'admin' | 'readonly';

export type AdminUsersSearchParams = {
  page: number;
  limit: number;
  search?: string;
  mode: AdminCapabilityMode;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseMode(value: string | undefined): AdminCapabilityMode {
  if (value === 'readonly') {
    return 'readonly';
  }

  return 'admin';
}

export function parseAdminUsersSearchParams(raw: RawSearchParams): AdminUsersSearchParams {
  const page = pickFirst(raw.page);
  const limit = pickFirst(raw.limit);
  const search = pickFirst(raw.search);
  const mode = pickFirst(raw.mode);

  const listQuery = listUsersQuerySchema.parse({
    page,
    limit,
    search,
  });

  return {
    page: listQuery.page,
    limit: listQuery.limit,
    search: listQuery.search,
    mode: parseMode(mode),
  };
}

export function buildAdminUsersSearchParams(next: AdminUsersSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));
  params.set('mode', next.mode);

  if (next.search) {
    params.set('search', next.search);
  }

  return params;
}
