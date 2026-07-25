import { listUsersQuerySchema } from '@hms/shared-types';

export type AdminUsersSearchParams = {
  page: number;
  limit: number;
  search?: string;
  roleCode?: string;
  isActive?: 'true' | 'false';
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PARAMS: AdminUsersSearchParams = {
  page: 1,
  limit: 10,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parseAdminUsersSearchParams(raw: RawSearchParams): AdminUsersSearchParams {
  const active = pickFirst(raw.active);
  const parsed = listUsersQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    search: pickFirst(raw.q),
    roleCode: pickFirst(raw.role),
    isActive: active,
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    search: parsed.data.search,
    roleCode: parsed.data.roleCode,
    isActive: active === 'true' || active === 'false' ? active : undefined,
  };
}

export function buildAdminUsersSearchParams(next: AdminUsersSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.search) {
    params.set('q', next.search);
  }
  if (next.roleCode) {
    params.set('role', next.roleCode);
  }
  if (next.isActive) {
    params.set('active', next.isActive);
  }

  return params;
}
