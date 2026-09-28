'use client';

import type { AnalyticsOperationsData, AnalyticsResponseMeta } from '@hms/shared-types';
import { useFormatter, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsAppointmentOutcomesCard } from '#components/client/analytics/analytics-appointment-outcomes-card';
import { AnalyticsBookingChannelCard } from '#components/client/analytics/analytics-booking-channel-card';
import { AnalyticsBusiestHoursPlaceholder } from '#components/client/analytics/analytics-busiest-hours-placeholder';
import { AnalyticsOperationsKpis } from '#components/client/analytics/analytics-operations-kpis';
import { AnalyticsReportingSummaryCard } from '#components/client/analytics/analytics-reporting-summary-card';
import { AnalyticsVisitsByPoliCard } from '#components/client/analytics/analytics-visits-by-poli-card';
import { AnalyticsVisitsTrendCard } from '#components/client/analytics/analytics-visits-trend-card';
import { formatAnalyticsDateRange } from '#lib/analytics/format-analytics-date-range';

type AnalyticsOperationsContentProps = {
  operations: AnalyticsOperationsData;
  meta: AnalyticsResponseMeta;
  reportingHref: string;
};

/** The operations dashboard's figures, laid out as the Operasional artboard. */
export function AnalyticsOperationsContent({
  operations,
  meta,
  reportingHref,
}: AnalyticsOperationsContentProps) {
  const format = useFormatter();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const currentLabel = formatAnalyticsDateRange(meta, formatDate);
  const previousLabel = operations.comparison
    ? formatAnalyticsDateRange(operations.comparison, formatDate)
    : undefined;
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsOperationsKpis operations={operations} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsVisitsTrendCard
          operations={operations}
          granularity={meta.granularity}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />
        <AnalyticsVisitsByPoliCard
          breakdowns={operations.breakdowns}
          previousLabel={previousLabel}
        />
      </div>
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsBookingChannelCard channels={operations.breakdowns.bookingChannels} />
        <AnalyticsAppointmentOutcomesCard outcomes={operations.breakdowns.appointmentOutcomes} />
        <AnalyticsBusiestHoursPlaceholder />
      </div>
      <AnalyticsReportingSummaryCard
        range={{ from: meta.from, to: meta.to }}
        href={reportingHref}
      />
    </div>
  );
}
