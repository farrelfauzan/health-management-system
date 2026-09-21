import type { PostnatalScheduleResponse } from '@hms/shared-types';

import {
  getPostnatalVisitControllerGetScheduleV1QueryKey,
  postnatalVisitControllerGetScheduleV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/** The KF1–KF4 / KN1–KN3 windows of the birth that ended this pregnancy (P25-T12). */
export function usePostnatalSchedule(pregnancyEpisodeId: string, isEnabled: boolean) {
  const query = useApiQuery<PostnatalScheduleResponse>({
    queryKey: getPostnatalVisitControllerGetScheduleV1QueryKey(pregnancyEpisodeId),
    queryFn: (signal) => postnatalVisitControllerGetScheduleV1(pregnancyEpisodeId, signal),
    errorMessage: 'Failed to load the nifas schedule',
    enabled: isEnabled && pregnancyEpisodeId.length > 0,
  });

  return { ...query, schedule: query.data ?? null };
}
