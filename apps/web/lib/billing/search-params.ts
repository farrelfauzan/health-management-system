import { listInvoicesQuerySchema, type InvoiceStatusValue } from '@hms/shared-types';

export type InvoicesSearchParams = {
  page: number;
  limit: number;
  status?: InvoiceStatusValue;
  patientId?: string;
  encounterId?: string;
  createdFrom?: string;
  createdTo?: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export const INVOICES_PAGE_SIZE = 10;

const DEFAULT_PARAMS: InvoicesSearchParams = {
  page: 1,
  limit: INVOICES_PAGE_SIZE,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parseInvoicesSearchParams(raw: RawSearchParams): InvoicesSearchParams {
  const parsed = listInvoicesQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
    status: pickFirst(raw.status),
    patientId: pickFirst(raw.patient),
    encounterId: pickFirst(raw.encounter),
    createdFrom: pickFirst(raw.from),
    createdTo: pickFirst(raw.to),
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
    status: parsed.data.status,
    patientId: parsed.data.patientId,
    encounterId: parsed.data.encounterId,
    createdFrom: parsed.data.createdFrom,
    createdTo: parsed.data.createdTo,
  };
}

export function buildInvoicesSearchParams(next: InvoicesSearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  if (next.status) {
    params.set('status', next.status);
  }
  if (next.patientId) {
    params.set('patient', next.patientId);
  }
  if (next.encounterId) {
    params.set('encounter', next.encounterId);
  }
  if (next.createdFrom) {
    params.set('from', next.createdFrom);
  }
  if (next.createdTo) {
    params.set('to', next.createdTo);
  }

  return params;
}
