import type { SatusehatRecordComparisonView } from '@hms/shared-types';

import {
  getSatusehatRecordControllerCompareEncounterRecordV1QueryKey,
  satusehatRecordControllerCompareEncounterRecordV1,
} from '#lib/api/generated/satusehat/satusehat';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The treating doctor's comparison of a visit with what SATUSEHAT holds
 * (P21-T04).
 *
 * Disabled until the doctor asks, and never refreshed behind their back: every
 * run reads the national record live, one request per resource, on a platform
 * every vendor shares. A second look is an explicit `refetch`.
 */
export function useSatusehatRecordComparison(encounterId: string, isRequested: boolean) {
  const query = useApiQuery<SatusehatRecordComparisonView>({
    queryKey: getSatusehatRecordControllerCompareEncounterRecordV1QueryKey(encounterId),
    queryFn: (signal) => satusehatRecordControllerCompareEncounterRecordV1(encounterId, signal),
    errorMessage: 'Unable to compare the record with SATUSEHAT.',
    enabled: isRequested,
    options: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
  });

  return { ...query, comparison: query.data };
}
