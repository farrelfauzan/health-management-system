import { listEncountersQuerySchema, type EncounterStatusValue } from '@hms/shared-types';

export type EncountersSearchParams = {
  page: number;
  limit: number;
  status?: EncounterStatusValue;
  patientId?: string;
  doctorId?: string;
  registrationId?: string;
  startedFrom?: string;
  startedTo?: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PARAMS: EncountersSearchParams = {
  page: 1,
  limit: 10,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parseEncountersSearchParams(raw: RawSearchParams): EncountersSearchParams {
  const parsed = listEncountersQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    status: pickFirst(raw.status),
    patientId: pickFirst(raw.patient),
    doctorId: pickFirst(raw.doctor),
    registrationId: pickFirst(raw.registration),
    startedFrom: pickFirst(raw.from),
    startedTo: pickFirst(raw.to),
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    status: parsed.data.status,
    patientId: parsed.data.patientId,
    doctorId: parsed.data.doctorId,
    registrationId: parsed.data.registrationId,
    startedFrom: parsed.data.startedFrom,
    startedTo: parsed.data.startedTo,
  };
}

export function buildEncountersSearchParams(next: EncountersSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.status) {
    params.set('status', next.status);
  }
  if (next.patientId) {
    params.set('patient', next.patientId);
  }
  if (next.doctorId) {
    params.set('doctor', next.doctorId);
  }
  if (next.registrationId) {
    params.set('registration', next.registrationId);
  }
  if (next.startedFrom) {
    params.set('from', next.startedFrom);
  }
  if (next.startedTo) {
    params.set('to', next.startedTo);
  }

  return params;
}
