import type { PregnancyEpisodeResponse } from '@hms/shared-types';

import {
  getPregnancyEpisodeControllerListEpisodesV1QueryKey,
  pregnancyEpisodeControllerListEpisodesV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Her most recent delivered pregnancy, or null (P25-T12). Once the birth is
 * recorded the episode is no longer active, so the nifas timeline reads it
 * from the episode list rather than from the active-episode query.
 */
export function useLatestDeliveredEpisode(patientId: string, isEnabled: boolean) {
  const query = useApiQuery<PregnancyEpisodeResponse[]>({
    queryKey: getPregnancyEpisodeControllerListEpisodesV1QueryKey(patientId),
    queryFn: (signal) => pregnancyEpisodeControllerListEpisodesV1(patientId, signal),
    errorMessage: 'Failed to load the pregnancy episodes',
    enabled: isEnabled && patientId.length > 0,
  });
  const delivered = (query.data ?? []).find((episode) => episode.status === 'DELIVERED') ?? null;

  return { ...query, episode: delivered };
}
