'use client';

import { Skeleton } from '@hms/ui';

import { PostnatalScheduleCard } from '#components/client/maternal-care/postnatal-schedule-card';
import { useLatestDeliveredEpisode } from '#lib/maternal-care/use-latest-delivered-episode';
import { usePostnatalSchedule } from '#lib/maternal-care/use-postnatal-schedule';

type PostnatalScheduleSectionProps = {
  patientId: string;
};

/**
 * The nifas timeline of her most recent birth, or nothing when she has none
 * (P25-T12). Shown on the pregnancy tab after the episode has ended in a
 * delivery, which is exactly when the active-episode view goes empty.
 */
export function PostnatalScheduleSection({ patientId }: PostnatalScheduleSectionProps) {
  const episodeQuery = useLatestDeliveredEpisode(patientId, true);
  const episodeId = episodeQuery.episode?.id ?? '';
  const scheduleQuery = usePostnatalSchedule(episodeId, episodeId.length > 0);

  if (episodeQuery.isPending || (episodeId.length > 0 && scheduleQuery.isPending)) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (scheduleQuery.schedule === null) {
    return null;
  }
  return <PostnatalScheduleCard schedule={scheduleQuery.schedule} />;
}
