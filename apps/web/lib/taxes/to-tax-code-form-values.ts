import type { TaxCodeView } from '@hms/shared-types';

import type { TaxCodeFormValues } from '#lib/taxes/tax-code-form-values';

/**
 * A code as the form's starting position, or a new taxed code prefilled with
 * the rate in force since PMK 131/2024 (12% × 11/12).
 */
export function toTaxCodeFormValues(taxCode?: TaxCodeView): TaxCodeFormValues {
  return {
    code: taxCode?.code ?? '',
    name: taxCode?.name ?? '',
    ppnTreatment: taxCode?.ppnTreatment ?? 'STANDARD',
    fakturTransactionCode: taxCode ? (taxCode.fakturTransactionCode ?? '') : '04',
    invoiceNote: taxCode?.invoiceNote ?? '',
    isActive: taxCode?.isActive ?? true,
    initialRate: { ratePercent: '12', dppNumerator: '11', dppDenominator: '12', effectiveFrom: '' },
  };
}
