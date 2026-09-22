import type { BirthsDeathsReportResponse } from '@hms/shared-types';

import {
  getMaternalReportsControllerGetBirthsDeathsV1QueryKey,
  maternalReportsControllerGetBirthsDeathsV1,
} from '#lib/api/generated/maternal-reports/maternal-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/** The births and deaths preview (P25-T15). */
export function useBirthsDeathsReport(month: string, enabled: boolean) {
  const params = { month };
  return useApiQuery<BirthsDeathsReportResponse>({
    queryKey: getMaternalReportsControllerGetBirthsDeathsV1QueryKey(params),
    queryFn: (signal) => maternalReportsControllerGetBirthsDeathsV1(params, signal),
    errorMessage: 'Unable to load the births and deaths report.',
    enabled,
  });
}
