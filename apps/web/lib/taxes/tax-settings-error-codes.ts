/**
 * Refusals the tax form explains in the reader's language (P27-T02). Any other
 * failure shows the API's own message.
 */
export const TAX_SETTINGS_ERROR_CODES = [
  'TAX_PP55_NOT_ELIGIBLE',
  'TAX_PKP_SINCE_REQUIRED',
  'TAX_NITKU_NPWP_MISMATCH',
] as const;
