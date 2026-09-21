import type { ClinicianFeeRuleModeValue, ServiceTariffCategoryValue } from '@hms/shared-types';

/** Whether a rule names one tariff or a whole tariff category. */
export type ClinicianFeeRuleTargetKind = 'TARIFF' | 'CATEGORY';

/** A jasa medis rule as the form holds it: strings until save; `''` means unset. */
export type ClinicianFeeRuleFormValues = {
  targetKind: ClinicianFeeRuleTargetKind;
  serviceTariffId: string;
  category: ServiceTariffCategoryValue | '';
  doctorId: string;
  mode: ClinicianFeeRuleModeValue;
  value: string;
  effectiveFrom: string;
  effectiveTo: string;
};
