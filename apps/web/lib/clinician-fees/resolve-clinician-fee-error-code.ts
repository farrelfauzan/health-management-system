import { resolveApiErrorCode } from '#lib/api/resolve-api-error-code';
import {
  CLINICIAN_FEE_ERROR_CODES,
  type ClinicianFeeErrorCode,
} from '#lib/clinician-fees/clinician-fee-error-codes';

/** The jasa medis refusal an API error carries, when it is one the screens translate. */
export function resolveClinicianFeeErrorCode(error: unknown): ClinicianFeeErrorCode | undefined {
  const code = resolveApiErrorCode(error);
  return CLINICIAN_FEE_ERROR_CODES.find((candidate) => candidate === code);
}
