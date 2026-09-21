import type { EncounterPostnatalVisitResponse } from '@hms/shared-types';

import {
  getPostnatalVisitControllerGetEncounterVisitV1QueryKey,
  postnatalVisitControllerGetEncounterVisitV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Whether this encounter is counted as a nifas or neonatal visit, and as which
 * (P25-T12). `null` means it is not linked.
 */
export function useEncounterPostnatalVisit(encounterId: string, isEnabled: boolean) {
  const query = useApiQuery<EncounterPostnatalVisitResponse | null>({
    queryKey: getPostnatalVisitControllerGetEncounterVisitV1QueryKey(encounterId),
    queryFn: (signal) => postnatalVisitControllerGetEncounterVisitV1(encounterId, signal),
    errorMessage: 'Failed to load the postnatal visit',
    enabled: isEnabled && encounterId.length > 0,
  });

  return { ...query, visit: query.data ?? null };
}
