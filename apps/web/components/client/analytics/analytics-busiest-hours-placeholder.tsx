'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';

/** Holds the busiest-hours heatmap's place until it lands with the operations depth work. */
export function AnalyticsBusiestHoursPlaceholder() {
  const t = useTranslations('analytics.operations.busiestHours');
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      <div className="flex grow flex-col items-center justify-center gap-2 rounded-[10px] bg-surface-container-low p-6 text-center">
        <Icon name="calendar_view_week" size={24} className="text-primary" />
        <p className="max-w-60 text-[13px] text-slate-500">{t('comingSoon')}</p>
      </div>
    </AnalyticsCard>
  );
}
