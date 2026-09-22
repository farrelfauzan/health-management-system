import type { MonthlyKiaReportResponse } from '@hms/shared-types';

import {
  getMaternalReportsControllerGetMonthlyKiaV1QueryKey,
  maternalReportsControllerGetMonthlyKiaV1,
} from '#lib/api/generated/maternal-reports/maternal-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/** The monthly KIA indicator preview (P25-T15). */
export function useMonthlyKiaReport(month: string, enabled: boolean) {
  const params = { month };
  return useApiQuery<MonthlyKiaReportResponse>({
    queryKey: getMaternalReportsControllerGetMonthlyKiaV1QueryKey(params),
    queryFn: (signal) => maternalReportsControllerGetMonthlyKiaV1(params, signal),
    errorMessage: 'Unable to load the monthly KIA report.',
    enabled,
  });
}
