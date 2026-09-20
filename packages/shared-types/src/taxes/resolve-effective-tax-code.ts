import type { EffectiveTaxCode, ResolveEffectiveTaxCodeParams } from '#taxes/types';

/**
 * The code an item is taxed under (P27-T03, D-038): its own override, else its
 * category's default, else nothing. Unresolved is an answer, not a zero — the
 * assignment screen counts it and invoice issue (P27-T04) refuses it.
 */
export function resolveEffectiveTaxCode(params: ResolveEffectiveTaxCodeParams): EffectiveTaxCode {
  if (params.overrideTaxCodeId !== null) {
    return { source: 'OVERRIDE', taxCodeId: params.overrideTaxCodeId };
  }
  if (params.defaultTaxCodeId !== null) {
    return { source: 'CATEGORY_DEFAULT', taxCodeId: params.defaultTaxCodeId };
  }
  return { source: 'UNRESOLVED', taxCodeId: null };
}
