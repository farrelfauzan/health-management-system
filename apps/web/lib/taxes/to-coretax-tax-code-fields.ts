import type { TaxCoretaxFormValues } from '#lib/taxes/tax-coretax-form-values';

/** The Coretax fields as the API takes them (P27-T09); the facility only on a kode-08 code. */
export function toCoretaxTaxCodeFields(
  values: TaxCoretaxFormValues,
  isExempt: boolean,
): {
  coretaxItemCode: string | null;
  coretaxUnitCode: string | null;
  coretaxAdditionalInfo: string | null;
  coretaxFacilityStamp: string | null;
} {
  const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());
  return {
    coretaxItemCode: orNull(values.coretaxItemCode),
    coretaxUnitCode: orNull(values.coretaxUnitCode),
    coretaxAdditionalInfo: isExempt ? orNull(values.coretaxAdditionalInfo) : null,
    coretaxFacilityStamp: isExempt ? orNull(values.coretaxFacilityStamp) : null,
  };
}
