import type { TaxCodeView } from '@hms/shared-types';

import {
  getTaxCodeControllerListTaxCodesV1QueryKey,
  taxCodeControllerListTaxCodesV1,
} from '#lib/api/generated/tax-codes/tax-codes';
import { useApiQuery } from '#lib/api/use-api-query';

/** Stable while loading, so an effect keyed on the list does not rerun every render. */
const NO_TAX_CODES: TaxCodeView[] = [];

/** Every tax code with its rates and usage (P27-T03). */
export function useTaxCodes(enabled = true) {
  const result = useApiQuery<TaxCodeView[]>({
    queryKey: getTaxCodeControllerListTaxCodesV1QueryKey(),
    queryFn: (signal) => taxCodeControllerListTaxCodesV1(signal),
    errorMessage: 'Unable to load the tax codes.',
    enabled,
  });

  return { ...result, taxCodes: result.data ?? NO_TAX_CODES };
}
