import type { ClinicianFeeRuleView } from '@hms/shared-types';

import {
  clinicianFeeRuleControllerListRulesV1,
  getClinicianFeeRuleControllerListRulesV1QueryKey,
} from '#lib/api/generated/clinician-fees/clinician-fees';
import { useApiQuery } from '#lib/api/use-api-query';

/** Stable while loading, so an effect keyed on the list does not rerun every render. */
const NO_RULES: ClinicianFeeRuleView[] = [];

/** Every live jasa medis rule (P27-T06). */
export function useClinicianFeeRules() {
  const result = useApiQuery<ClinicianFeeRuleView[]>({
    queryKey: getClinicianFeeRuleControllerListRulesV1QueryKey(),
    queryFn: (signal) => clinicianFeeRuleControllerListRulesV1(signal),
    errorMessage: 'Unable to load the jasa medis rules.',
  });

  return { ...result, rules: result.data ?? NO_RULES };
}
