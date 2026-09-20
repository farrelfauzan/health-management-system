import type { TaxCategoryDefaultView } from '@hms/shared-types';

import {
  getTaxCategoryDefaultControllerListCategoryDefaultsV1QueryKey,
  taxCategoryDefaultControllerListCategoryDefaultsV1,
} from '#lib/api/generated/tax-codes/tax-codes';
import { useApiQuery } from '#lib/api/use-api-query';

/** Stable while loading, so an effect keyed on the list does not rerun every render. */
const NO_DEFAULTS: TaxCategoryDefaultView[] = [];

/** The code each tariff category and every medication falls back to (P27-T03). */
export function useTaxCategoryDefaults(enabled = true) {
  const result = useApiQuery<TaxCategoryDefaultView[]>({
    queryKey: getTaxCategoryDefaultControllerListCategoryDefaultsV1QueryKey(),
    queryFn: (signal) => taxCategoryDefaultControllerListCategoryDefaultsV1(signal),
    errorMessage: 'Unable to load the tax defaults.',
    enabled,
  });

  return { ...result, defaults: result.data ?? NO_DEFAULTS };
}
