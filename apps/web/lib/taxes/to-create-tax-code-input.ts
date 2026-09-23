import { createTaxCodeSchema, type CreateTaxCodeInput } from '@hms/shared-types';

import type { TaxCodeFormValues } from '#lib/taxes/tax-code-form-values';
import { toCoretaxTaxCodeFields } from '#lib/taxes/to-coretax-tax-code-fields';
import { toCreateTaxCodeRateInput } from '#lib/taxes/to-create-tax-code-rate-input';

/** The create form as the API expects it, or `null` when a field is not valid yet. */
export function toCreateTaxCodeInput(values: TaxCodeFormValues): CreateTaxCodeInput | null {
  const initialRate =
    values.ppnTreatment === 'STANDARD' ? toCreateTaxCodeRateInput(values.initialRate) : undefined;
  if (initialRate === null) {
    return null;
  }
  const parsed = createTaxCodeSchema.safeParse({
    code: values.code,
    name: values.name,
    ppnTreatment: values.ppnTreatment,
    fakturTransactionCode:
      values.fakturTransactionCode === '' ? null : values.fakturTransactionCode,
    invoiceNote: values.invoiceNote.trim() === '' ? null : values.invoiceNote,
    ...toCoretaxTaxCodeFields(values.coretax, values.fakturTransactionCode === '08'),
    initialRate,
  });
  return parsed.success ? parsed.data : null;
}
