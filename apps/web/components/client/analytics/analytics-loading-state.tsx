'use client';

import { Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

const KPI_PLACEHOLDERS = 3;

/** The dashboard's shape while its figures load, so nothing jumps when they arrive. */
export function AnalyticsLoadingState() {
  const t = useTranslations('analytics.states');
  return (
    <div aria-busy="true" aria-label={t('loading')} className="flex flex-col gap-5">
      <div className="flex gap-5">
        {Array.from({ length: KPI_PLACEHOLDERS }, (_, index) => (
          <Skeleton key={index} className="h-36 flex-1 rounded-[14px]" />
        ))}
      </div>
      <div className="flex gap-5">
        <Skeleton className="h-80 flex-[2_1_0] rounded-[14px]" />
        <Skeleton className="h-80 flex-1 rounded-[14px]" />
      </div>
    </div>
  );
}
