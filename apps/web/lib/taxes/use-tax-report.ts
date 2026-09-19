import type { TaxReportView } from '@hms/shared-types';

import {
  getTaxReportControllerGetReportV1QueryKey,
  taxReportControllerGetReportV1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/** One monthly tax report, compared with the books as they are now (P27-T05). */
export function useTaxReport(reportId: string) {
  const result = useApiQuery<TaxReportView>({
    queryKey: getTaxReportControllerGetReportV1QueryKey(reportId),
    queryFn: (signal) => taxReportControllerGetReportV1(reportId, signal),
    errorMessage: 'Unable to load the tax report.',
  });

  return { ...result, report: result.data };
}
