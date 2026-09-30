'use client';

import type { AnalyticsPracticeData, AnalyticsResponseMeta } from '@hms/shared-types';
import { useFormatter, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsPracticeDiagnosesCard } from '#components/client/analytics/analytics-practice-diagnoses-card';
import { AnalyticsPracticeFeesCard } from '#components/client/analytics/analytics-practice-fees-card';
import { AnalyticsPracticeKpis } from '#components/client/analytics/analytics-practice-kpis';
import { AnalyticsPracticeTrendCard } from '#components/client/analytics/analytics-practice-trend-card';
import { formatAnalyticsDateRange } from '#lib/analytics/format-analytics-date-range';

type AnalyticsPracticeContentProps = {
  practice: AnalyticsPracticeData;
  meta: AnalyticsResponseMeta;
};

/** The clinician's own figures, laid out as the Praktik saya artboard. */
export function AnalyticsPracticeContent({ practice, meta }: AnalyticsPracticeContentProps) {
  const format = useFormatter();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const currentLabel = formatAnalyticsDateRange(meta, formatDate);
  const previousLabel = practice.comparison
    ? formatAnalyticsDateRange(practice.comparison, formatDate)
    : undefined;
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsPracticeKpis practice={practice} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsPracticeTrendCard
          practice={practice}
          granularity={meta.granularity}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />
        <AnalyticsPracticeDiagnosesCard breakdowns={practice.breakdowns} />
      </div>
      <AnalyticsPracticeFeesCard practice={practice} />
    </div>
  );
}
