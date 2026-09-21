import type { HasOverlappingClinicianFeeRuleParams } from '#clinician-fee/types';

/**
 * Whether a rule's dates overlap another rule for the same target and
 * clinician (P27-T06). Both ends are inclusive and a null end is open, so a
 * rule ending on the 31st and one starting on the 1st do not overlap.
 */
export function hasOverlappingClinicianFeeRule(
  params: HasOverlappingClinicianFeeRuleParams,
): boolean {
  const { candidate } = params;
  return params.existing.some(
    (rule) =>
      (candidate.effectiveTo === null || rule.effectiveFrom <= candidate.effectiveTo) &&
      (rule.effectiveTo === null || candidate.effectiveFrom <= rule.effectiveTo),
  );
}
