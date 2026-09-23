import type { TaxCodeView, UpdateTaxCodeInput } from '@hms/shared-types';

import type { TaxCodeFormValues } from '#lib/taxes/tax-code-form-values';
import { toCoretaxTaxCodeFields } from '#lib/taxes/to-coretax-tax-code-fields';

/**
 * Only what changed on an existing code; a system code never sends a faktur
 * code. The Coretax fields (P27-T09) may change on any code.
 */
export function toUpdateTaxCodeInput(
  values: TaxCodeFormValues,
  taxCode: TaxCodeView,
): UpdateTaxCodeInput {
  const invoiceNote = values.invoiceNote.trim() === '' ? null : values.invoiceNote.trim();
  const fakturTransactionCode =
    values.fakturTransactionCode === '' ? null : values.fakturTransactionCode;
  const coretax = toCoretaxTaxCodeFields(values.coretax, fakturTransactionCode === '08');
  return {
    ...(coretax.coretaxItemCode !== (taxCode.coretaxItemCode ?? null)
      ? { coretaxItemCode: coretax.coretaxItemCode }
      : {}),
    ...(coretax.coretaxUnitCode !== (taxCode.coretaxUnitCode ?? null)
      ? { coretaxUnitCode: coretax.coretaxUnitCode }
      : {}),
    ...(coretax.coretaxAdditionalInfo !== (taxCode.coretaxAdditionalInfo ?? null)
      ? { coretaxAdditionalInfo: coretax.coretaxAdditionalInfo }
      : {}),
    ...(coretax.coretaxFacilityStamp !== (taxCode.coretaxFacilityStamp ?? null)
      ? { coretaxFacilityStamp: coretax.coretaxFacilityStamp }
      : {}),
    ...(values.name.trim() !== taxCode.name ? { name: values.name.trim() } : {}),
    ...(invoiceNote !== (taxCode.invoiceNote ?? null) ? { invoiceNote } : {}),
    ...(values.isActive !== taxCode.isActive ? { isActive: values.isActive } : {}),
    ...(!taxCode.isSystem && fakturTransactionCode !== (taxCode.fakturTransactionCode ?? null)
      ? { fakturTransactionCode }
      : {}),
  };
}
