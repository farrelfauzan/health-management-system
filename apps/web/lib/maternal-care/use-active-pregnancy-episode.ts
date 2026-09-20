import type { ActivePregnancyEpisodeResponse } from '@hms/shared-types';

import {
  getPregnancyEpisodeControllerGetActiveEpisodeV1QueryKey,
  pregnancyEpisodeControllerGetActiveEpisodeV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The patient's running pregnancy, with its numbered visits and trimester
 * schedule (P25-T06). `null` data is the ordinary "not pregnant right now"
 * answer, not a failure — the panel renders its empty state from it.
 */
export function useActivePregnancyEpisode(patientId: string, isEnabled: boolean) {
  const query = useApiQuery<ActivePregnancyEpisodeResponse | null>({
    queryKey: getPregnancyEpisodeControllerGetActiveEpisodeV1QueryKey(patientId),
    queryFn: (signal) => pregnancyEpisodeControllerGetActiveEpisodeV1(patientId, signal),
    errorMessage: 'Failed to load the pregnancy record',
    enabled: isEnabled && patientId.length > 0,
  });

  return { ...query, episode: query.data ?? null };
}
