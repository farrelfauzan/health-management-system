import type { CashierDailyReport } from '@hms/shared-types';

import {
  cashierReportControllerGetDailyReportV1,
  getCashierReportControllerGetDailyReportV1QueryKey,
} from '#lib/api/generated/reports/reports';
import type { CashierReportControllerGetDailyReportV1Params } from '#lib/api/generated/model/cashierReportControllerGetDailyReportV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * `date` is omitted rather than computed client-side when the cashier wants
 * today: the clinic day is a server concern (CLINIC_TIMEZONE), and a browser
 * in another timezone must not decide which day the drawer belongs to.
 */
export function useCashierDailyReport(date: string) {
  const requestParams: CashierReportControllerGetDailyReportV1Params = date.length > 0 ? { date } : {};

  const query = useApiQuery<CashierDailyReport>({
    queryKey: getCashierReportControllerGetDailyReportV1QueryKey(requestParams),
    queryFn: (signal) => cashierReportControllerGetDailyReportV1(requestParams, signal),
    errorMessage: 'Failed to load the cashier report',
  });

  return {
    ...query,
    report: query.data,
  };
}
