'use client';

import type { AnalyticsOperationsData, AnalyticsResponseMeta } from '@hms/shared-types';
import { useFormatter, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsAppointmentOutcomesCard } from '#components/client/analytics/analytics-appointment-outcomes-card';
import { AnalyticsBookingChannelCard } from '#components/client/analytics/analytics-booking-channel-card';
import { AnalyticsBusiestHoursCard } from '#components/client/analytics/analytics-busiest-hours-card';
import { AnalyticsInpatientCard } from '#components/client/analytics/analytics-inpatient-card';
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
        <AnalyticsAppointmentOutcomesCard
          outcomes={operations.breakdowns.appointmentOutcomes}
          sessionUtilisationPercent={operations.totals.sessionUtilisationPercent}
        />
        <AnalyticsBusiestHoursCard cells={operations.breakdowns.busiestHours} />
      </div>
      <div className="flex flex-col gap-5 xl:flex-row">
        {operations.totals.inpatient ? (
          <AnalyticsInpatientCard
            inpatient={operations.totals.inpatient}
            previous={operations.comparison?.totals.inpatient}
            dispositions={operations.breakdowns.inpatientDispositions ?? []}
          />
        ) : null}
        <AnalyticsReportingSummaryCard
          range={{ from: meta.from, to: meta.to }}
          href={reportingHref}
        />
      </div>
    </div>
  );
}
