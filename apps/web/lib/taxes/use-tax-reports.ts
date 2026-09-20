import type { TaxReportListItem, TaxReportsListMeta } from '@hms/shared-types';

import {
  getTaxReportControllerListReportsV1QueryKey,
  taxReportControllerListReportsV1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/** Stable while loading, so nothing keyed on the list reruns every render. */
const NO_REPORTS: TaxReportListItem[] = [];

/** A year of monthly tax report drafts, and which kinds the tax profile calls for (P27-T05). */
export function useTaxReports(year: number) {
  const params = { year };
  const result = useApiQuery<TaxReportListItem[]>({
    queryKey: getTaxReportControllerListReportsV1QueryKey(params),
    queryFn: (signal) => taxReportControllerListReportsV1(params, signal),
    errorMessage: 'Unable to load the tax reports.',
  });

  return {
    ...result,
    reports: result.data ?? NO_REPORTS,
    meta: result.meta as TaxReportsListMeta | undefined,
  };
}
