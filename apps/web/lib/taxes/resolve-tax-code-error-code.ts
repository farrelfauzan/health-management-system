import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { TAX_CODE_ERROR_CODES, type TaxCodeErrorCode } from '#lib/taxes/tax-code-error-codes';

/** The tax-code refusal an API error carries, when it is one the screens translate. */
export function resolveTaxCodeErrorCode(error: unknown): TaxCodeErrorCode | undefined {
  const code = resolveApiErrorCode(error);
  return TAX_CODE_ERROR_CODES.find((candidate) => candidate === code);
}
