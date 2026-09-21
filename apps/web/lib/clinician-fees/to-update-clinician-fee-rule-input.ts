import { updateClinicianFeeRuleSchema, type UpdateClinicianFeeRuleInput } from '@hms/shared-types';

import type { ClinicianFeeRuleFormValues } from '#lib/clinician-fees/clinician-fee-rule-form-values';

/** The terms the update route replaces, or `null` when they are not valid yet. */
export function toUpdateClinicianFeeRuleInput(
  values: ClinicianFeeRuleFormValues,
): UpdateClinicianFeeRuleInput | null {
  const parsed = updateClinicianFeeRuleSchema.safeParse({
    mode: values.mode,
    value: Number(values.value.replace(',', '.')),
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo || undefined,
  });
  return parsed.success ? parsed.data : null;
}
