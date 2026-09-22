import type { TaxReportIdentifiersView } from '@hms/shared-types';

import {
  getTaxReportControllerRevealIdentifiersV1QueryKey,
  taxReportControllerRevealIdentifiersV1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The full NPWP or NIK of every clinician on a PPh 21 report (P27-T07). Off
 * until the reader asks: every fetch is an audited identifier unmask on the
 * API, so it must be a deliberate click, never a page load.
 */
export function useTaxReportIdentifiers(reportId: string, isEnabled: boolean) {
  const result = useApiQuery<TaxReportIdentifiersView>({
    queryKey: getTaxReportControllerRevealIdentifiersV1QueryKey(reportId),
    queryFn: (signal) => taxReportControllerRevealIdentifiersV1(reportId, signal),
    errorMessage: 'Unable to load the clinician tax identities.',
    enabled: isEnabled,
    options: { staleTime: 0, gcTime: 0 },
  });

  return { ...result, identifiers: result.data };
}
