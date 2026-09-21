import type { ClinicianFeeRuleView } from '@hms/shared-types';

import type { ClinicianFeeRuleFormValues } from '#lib/clinician-fees/clinician-fee-rule-form-values';

/** A blank form for a new rule, or an existing rule's values for editing. */
export function toClinicianFeeRuleFormValues(
  rule: ClinicianFeeRuleView | null,
): ClinicianFeeRuleFormValues {
  if (rule === null) {
    return {
      targetKind: 'CATEGORY',
      serviceTariffId: '',
      category: 'CONSULTATION',
      doctorId: '',
      mode: 'PERCENT',
      value: '',
      effectiveFrom: '',
      effectiveTo: '',
    };
  }
  return {
    targetKind: rule.serviceTariffId ? 'TARIFF' : 'CATEGORY',
    serviceTariffId: rule.serviceTariffId ?? '',
    category: rule.category ?? '',
    doctorId: rule.doctorId ?? '',
    mode: rule.mode,
    value: String(rule.value),
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo ?? '',
  };
}
