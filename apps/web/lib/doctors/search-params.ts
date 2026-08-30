import { listDoctorsQuerySchema } from '@hms/shared-types';

export type DoctorsSearchParams = {
  page: number;
  limit: number;
  search?: string;
  specialtyId?: string;
  isActive?: 'true' | 'false';
  /** Kept as the wire string so it round-trips through the URL unchanged. */
  missingNik?: 'true' | 'false';
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PARAMS: DoctorsSearchParams = {
  page: 1,
  limit: 10,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parseDoctorsSearchParams(raw: RawSearchParams): DoctorsSearchParams {
  const active = pickFirst(raw.active);
  const missingNik = pickFirst(raw.missingNik);
  const parsed = listDoctorsQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    search: pickFirst(raw.q),
    specialtyId: pickFirst(raw.specialtyId),
    isActive: active,
    missingNik,
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    search: parsed.data.search,
    specialtyId: parsed.data.specialtyId,
    isActive: active === 'true' || active === 'false' ? active : undefined,
    missingNik: missingNik === 'true' || missingNik === 'false' ? missingNik : undefined,
  };
}

export function buildDoctorsSearchParams(next: DoctorsSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.search) {
    params.set('q', next.search);
  }
  if (next.specialtyId) {
    params.set('specialtyId', next.specialtyId);
  }
  if (next.isActive) {
    params.set('active', next.isActive);
  }
  if (next.missingNik) {
    params.set('missingNik', next.missingNik);
  }

  return params;
}
