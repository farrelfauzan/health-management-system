import type { CoretaxExportValidationView } from '@hms/shared-types';

import {
  getTaxReportCoretaxControllerValidateBp21V1QueryKey,
  taxReportCoretaxControllerValidateBp21V1,
} from '#lib/api/generated/tax-reports/tax-reports';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Whether a finalized PPh 21 report can become a Coretax BP21 file yet
 * (P27-T08), with every problem listed per clinician. Reads no identifier
 * back, so it runs on page load; the download is the audited act.
 */
export function useCoretaxBp21Validation(reportId: string, isEnabled: boolean) {
  const result = useApiQuery<CoretaxExportValidationView>({
    queryKey: getTaxReportCoretaxControllerValidateBp21V1QueryKey(reportId),
    queryFn: (signal) => taxReportCoretaxControllerValidateBp21V1(reportId, signal),
    errorMessage: 'Unable to check the report against the Coretax template.',
    enabled: isEnabled,
    options: { staleTime: 0 },
  });

  return { ...result, validation: result.data };
}
