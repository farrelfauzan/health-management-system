import { createClinicianFeeRuleSchema, type CreateClinicianFeeRuleInput } from '@hms/shared-types';

import type { ClinicianFeeRuleFormValues } from '#lib/clinician-fees/clinician-fee-rule-form-values';

/** The form as the create route expects it, or `null` when it is not a valid rule yet. */
export function toCreateClinicianFeeRuleInput(
  values: ClinicianFeeRuleFormValues,
): CreateClinicianFeeRuleInput | null {
  const isTariff = values.targetKind === 'TARIFF';
  const parsed = createClinicianFeeRuleSchema.safeParse({
    serviceTariffId: isTariff && values.serviceTariffId ? values.serviceTariffId : undefined,
    category: !isTariff && values.category ? values.category : undefined,
    doctorId: values.doctorId || undefined,
    mode: values.mode,
    value: Number(values.value.replace(',', '.')),
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo || undefined,
  });
  return parsed.success ? parsed.data : null;
}
