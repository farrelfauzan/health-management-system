import type { TaxCodeView, UpdateTaxCodeInput } from '@hms/shared-types';

import type { TaxCodeFormValues } from '#lib/taxes/tax-code-form-values';

/** Only what changed on an existing code; a system code never sends a faktur code. */
export function toUpdateTaxCodeInput(
  values: TaxCodeFormValues,
  taxCode: TaxCodeView,
): UpdateTaxCodeInput {
  const invoiceNote = values.invoiceNote.trim() === '' ? null : values.invoiceNote.trim();
  const fakturTransactionCode =
    values.fakturTransactionCode === '' ? null : values.fakturTransactionCode;
  return {
    ...(values.name.trim() !== taxCode.name ? { name: values.name.trim() } : {}),
    ...(invoiceNote !== (taxCode.invoiceNote ?? null) ? { invoiceNote } : {}),
    ...(values.isActive !== taxCode.isActive ? { isActive: values.isActive } : {}),
    ...(!taxCode.isSystem && fakturTransactionCode !== (taxCode.fakturTransactionCode ?? null)
      ? { fakturTransactionCode }
      : {}),
  };
}
