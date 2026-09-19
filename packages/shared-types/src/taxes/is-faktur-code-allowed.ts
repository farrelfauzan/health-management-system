import { ALLOWED_FAKTUR_CODES_BY_TREATMENT } from '#taxes/schemas';
import type { IsFakturCodeAllowedParams } from '#taxes/types';

/** Whether a faktur code is the one this treatment is reported under (P27-T03). */
export function isFakturCodeAllowed(params: IsFakturCodeAllowedParams): boolean {
  return ALLOWED_FAKTUR_CODES_BY_TREATMENT[params.ppnTreatment].includes(
    params.fakturTransactionCode,
  );
}
