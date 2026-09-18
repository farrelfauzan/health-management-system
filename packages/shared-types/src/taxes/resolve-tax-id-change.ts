import { normalizeNpwp } from '#taxes/normalize-npwp';
import { NPWP_DIGIT_COUNT } from '#taxes/schemas';
import type { ResolveTaxIdChangeParams, TaxIdChange } from '#taxes/types';

/**
 * Decides what a clinic-profile save does to the NPWP (P27-T02, D-038 R8).
 *
 * The profile form sends every field on every save, so a stored 15-digit NPWP
 * comes back unchanged each time somebody fixes the phone number. Refusing it
 * then would block every unrelated edit until the tax identifier is upgraded;
 * so a value equal to the stored one, however punctuated, is left alone, and
 * only a *new* value must be the 16 digits Coretax expects. New values are
 * stored as digits only.
 */
export function resolveTaxIdChange(params: ResolveTaxIdChangeParams): TaxIdChange {
  if (params.requested === undefined) {
    return { kind: 'unchanged' };
  }
  const requested = normalizeNpwp(params.requested ?? '');
  if (requested === '') {
    return params.stored === null ? { kind: 'unchanged' } : { kind: 'cleared' };
  }
  if (params.stored !== null && requested === normalizeNpwp(params.stored)) {
    return { kind: 'unchanged' };
  }
  if (!new RegExp(`^\\d{${NPWP_DIGIT_COUNT}}$`).test(requested)) {
    return {
      kind: 'invalid',
      reason: `NPWP must be ${NPWP_DIGIT_COUNT} digits (the Coretax format); an individual's NIK is their NPWP`,
    };
  }
  return { kind: 'set', value: requested };
}
