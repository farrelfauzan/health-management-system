import { listPrescriptionsQuerySchema } from '@hms/shared-types';

export type PharmacySearchParams = {
  page: number;
  limit: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_PARAMS: PharmacySearchParams = {
  page: 1,
  limit: 10,
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function parsePharmacySearchParams(raw: RawSearchParams): PharmacySearchParams {
  const parsed = listPrescriptionsQuerySchema.safeParse({
    page: pickFirst(raw.page),
    limit: pickFirst(raw.limit),
  });

  if (!parsed.success) {
    return DEFAULT_PARAMS;
  }

  return {
    page: parsed.data.page,
    limit: parsed.data.limit,
  };
}

export function buildPharmacySearchParams(next: PharmacySearchParams): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(next.page));
  params.set('limit', String(next.limit));

  return params;
}
