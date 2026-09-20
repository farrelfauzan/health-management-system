import { normalizeNpwp } from '#taxes/normalize-npwp';
import { LEGACY_NPWP_DIGIT_COUNT, NPWP_DIGIT_COUNT, type NpwpStatusValue } from '#taxes/schemas';

/**
 * Classifies a stored NPWP for Coretax. A 15-digit value predates the 16-digit
 * format and is flagged for an update rather than treated as broken: it was
 * correct when it was typed.
 */
export function resolveNpwpStatus(value: string | null): NpwpStatusValue {
  const digits = normalizeNpwp(value ?? '');
  if (digits === '') {
    return 'MISSING';
  }
  if (!/^\d+$/.test(digits)) {
    return 'INVALID';
  }
  if (digits.length === NPWP_DIGIT_COUNT) {
    return 'VALID';
  }
  return digits.length === LEGACY_NPWP_DIGIT_COUNT ? 'LEGACY_15_DIGIT' : 'INVALID';
}
