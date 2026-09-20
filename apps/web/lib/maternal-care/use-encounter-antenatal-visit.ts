import type { EncounterAntenatalVisitResponse } from '@hms/shared-types';

import {
  getPregnancyEpisodeControllerGetEncounterVisitV1QueryKey,
  pregnancyEpisodeControllerGetEncounterVisitV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Whether this encounter is counted as an antenatal visit, and as which
 * (P25-T06). `null` means it is not linked, which is what the card offers to
 * change.
 */
export function useEncounterAntenatalVisit(encounterId: string, isEnabled: boolean) {
  const query = useApiQuery<EncounterAntenatalVisitResponse | null>({
    queryKey: getPregnancyEpisodeControllerGetEncounterVisitV1QueryKey(encounterId),
    queryFn: (signal) => pregnancyEpisodeControllerGetEncounterVisitV1(encounterId, signal),
    errorMessage: 'Failed to load the antenatal visit',
    enabled: isEnabled && encounterId.length > 0,
  });

  return { ...query, visit: query.data ?? null };
}
