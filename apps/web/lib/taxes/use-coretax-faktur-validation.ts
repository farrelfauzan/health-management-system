import type { CoretaxFakturValidationView } from '@hms/shared-types';

import {
  getTaxReportCoretaxFakturControllerValidateFakturV1QueryKey,
  taxReportCoretaxFakturControllerValidateFakturV1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Whether a finalized PPN keluaran report can become a Coretax Faktur
 * Keluaran file yet (P27-T09), with every problem listed per invoice. Reads
 * no identifier back, so it runs on page load; the download is the audited act.
 */
export function useCoretaxFakturValidation(reportId: string, isEnabled: boolean) {
  const result = useApiQuery<CoretaxFakturValidationView>({
    queryKey: getTaxReportCoretaxFakturControllerValidateFakturV1QueryKey(reportId),
    queryFn: (signal) => taxReportCoretaxFakturControllerValidateFakturV1(reportId, signal),
    errorMessage: 'Unable to check the report against the Coretax template.',
    enabled: isEnabled,
    options: { staleTime: 0 },
  });

  return { ...result, validation: result.data };
}
