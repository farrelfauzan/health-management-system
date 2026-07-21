import { listPatientsQuerySchema, type PatientStatusValue } from '@hms/shared-types';

export type PatientsSearchParams = {
  page: number;
  limit: number;
  search?: string;
  status?: PatientStatusValue;
  createdFrom?: string;
  createdTo?: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PARAMS: PatientsSearchParams = {
  page: 1,
  limit: 10,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parsePatientsSearchParams(raw: RawSearchParams): PatientsSearchParams {
  const parsed = listPatientsQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    search: pickFirst(raw.q),
    status: pickFirst(raw.status),
    createdFrom: pickFirst(raw.from),
    createdTo: pickFirst(raw.to),
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    search: parsed.data.search,
    status: parsed.data.status,
    createdFrom: parsed.data.createdFrom,
    createdTo: parsed.data.createdTo,
  };
}

export function buildPatientsSearchParams(next: PatientsSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.search) {
    params.set('q', next.search);
  }
  if (next.status) {
    params.set('status', next.status);
  }
  if (next.createdFrom) {
    params.set('from', next.createdFrom);
  }
  if (next.createdTo) {
    params.set('to', next.createdTo);
  }

  return params;
}
