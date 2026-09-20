import { createTaxCodeRateSchema, type CreateTaxCodeRateInput } from '@hms/shared-types';

import type { TaxRateFormValues } from '#lib/taxes/tax-rate-form-values';

/** The rate form as the API expects it, or `null` when it is not a valid rate yet. */
export function toCreateTaxCodeRateInput(values: TaxRateFormValues): CreateTaxCodeRateInput | null {
  const parsed = createTaxCodeRateSchema.safeParse({
    ratePercent: Number(values.ratePercent.replace(',', '.')),
    dppNumerator: Number(values.dppNumerator),
    dppDenominator: Number(values.dppDenominator),
    effectiveFrom: values.effectiveFrom,
  });
  return parsed.success ? parsed.data : null;
}
