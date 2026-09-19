/** Refusals the tax-code screens explain in the reader's language (P27-T03). */
export const TAX_CODE_ERROR_CODES = [
  'TAX_CODE_SYSTEM_LOCKED',
  'TAX_CODE_IN_USE',
  'TAX_CODE_CONFLICT',
  'TAX_CODE_INACTIVE',
  'TAX_CODE_FAKTUR_MISMATCH',
  'TAX_RATE_NOT_AFTER_LATEST',
  'TAX_RATE_NOT_APPLICABLE',
  'TAX_ASSIGNMENT_TARGET_NOT_FOUND',
] as const;

export type TaxCodeErrorCode = (typeof TAX_CODE_ERROR_CODES)[number];
