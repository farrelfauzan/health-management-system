import type { ClinicianFeePeriodSummaryView } from '@hms/shared-types';

import {
  clinicianFeeStatementControllerGetPeriodSummaryV1,
  getClinicianFeeStatementControllerGetPeriodSummaryV1QueryKey,
} from '#lib/api/generated/clinician-fees/clinician-fees';
import { useApiQuery } from '#lib/api/use-api-query';

/** Every clinician's jasa medis total for one clinic-local month (P27-T06). */
export function useClinicianFeePeriodSummary(period: string) {
  const params = { period };
  const result = useApiQuery<ClinicianFeePeriodSummaryView>({
    queryKey: getClinicianFeeStatementControllerGetPeriodSummaryV1QueryKey(params),
    queryFn: (signal) => clinicianFeeStatementControllerGetPeriodSummaryV1(params, signal),
    errorMessage: 'Unable to load the jasa medis summary.',
    enabled: period.length > 0,
  });

  return { ...result, summary: result.data };
}
