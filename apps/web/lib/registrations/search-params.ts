import { listRegistrationsQuerySchema, type RegistrationStatusValue } from '@hms/shared-types';

export type RegistrationsSearchParams = {
  page: number;
  limit: number;
  search?: string;
  status?: RegistrationStatusValue;
  doctorId?: string;
  registeredFrom?: string;
  registeredTo?: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PARAMS: RegistrationsSearchParams = {
  page: 1,
  limit: 10,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parseRegistrationsSearchParams(raw: RawSearchParams): RegistrationsSearchParams {
  const parsed = listRegistrationsQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    search: pickFirst(raw.q),
    status: pickFirst(raw.status),
    doctorId: pickFirst(raw.doctor),
    registeredFrom: pickFirst(raw.from),
    registeredTo: pickFirst(raw.to),
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    search: parsed.data.search,
    status: parsed.data.status,
    doctorId: parsed.data.doctorId,
    registeredFrom: parsed.data.registeredFrom,
    registeredTo: parsed.data.registeredTo,
  };
}

export function buildRegistrationsSearchParams(next: RegistrationsSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.search) {
    params.set('q', next.search);
  }
  if (next.status) {
    params.set('status', next.status);
  }
  if (next.doctorId) {
    params.set('doctor', next.doctorId);
  }
  if (next.registeredFrom) {
    params.set('from', next.registeredFrom);
  }
  if (next.registeredTo) {
    params.set('to', next.registeredTo);
  }

  return params;
}
