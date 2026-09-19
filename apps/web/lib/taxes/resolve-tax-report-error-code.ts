import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import { TAX_REPORT_ERROR_CODES } from '#lib/taxes/tax-report-error-codes';

/** The tax report refusal an API error carries, when it is one the screens translate. */
export function resolveTaxReportErrorCode(
  error: unknown,
): (typeof TAX_REPORT_ERROR_CODES)[number] | undefined {
  const code = resolveApiErrorCode(error);
  return TAX_REPORT_ERROR_CODES.find((candidate) => candidate === code);
}
