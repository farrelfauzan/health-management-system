import { listDoctorsQuerySchema } from '@hms/shared-types';

export type DoctorsSearchParams = {
  page: number;
  limit: number;
  search?: string;
  specialty?: string;
  isActive?: 'true' | 'false';
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
  const parsed = listDoctorsQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    search: pickFirst(raw.q),
    specialty: pickFirst(raw.specialty),
    isActive: active,
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    search: parsed.data.search,
    specialty: parsed.data.specialty,
    isActive: active === 'true' || active === 'false' ? active : undefined,
  };
}

export function buildDoctorsSearchParams(next: DoctorsSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.search) {
    params.set('q', next.search);
  }
  if (next.specialty) {
    params.set('specialty', next.specialty);
  }
  if (next.isActive) {
    params.set('active', next.isActive);
  }

  return params;
}
