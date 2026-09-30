'use client';

import type { AnalyticsFinanceData, AnalyticsResponseMeta } from '@hms/shared-types';
import { useFormatter, type DateTimeFormatOptions } from 'next-intl';

import { AnalyticsFinanceKpis } from '#components/client/analytics/analytics-finance-kpis';
import { AnalyticsOutstandingCard } from '#components/client/analytics/analytics-outstanding-card';
import { AnalyticsPayerMixCard } from '#components/client/analytics/analytics-payer-mix-card';
import { AnalyticsPaymentMethodCard } from '#components/client/analytics/analytics-payment-method-card';
import { AnalyticsRevenueByDoctorCard } from '#components/client/analytics/analytics-revenue-by-doctor-card';
import { AnalyticsRevenueByServiceCard } from '#components/client/analytics/analytics-revenue-by-service-card';
import { AnalyticsRevenueTrendCard } from '#components/client/analytics/analytics-revenue-trend-card';
import { formatAnalyticsDateRange } from '#lib/analytics/format-analytics-date-range';

type AnalyticsFinanceContentProps = {
  finance: AnalyticsFinanceData;
  meta: AnalyticsResponseMeta;
};

/** The finance dashboard's figures, laid out as the Keuangan artboard. */
export function AnalyticsFinanceContent({ finance, meta }: AnalyticsFinanceContentProps) {
  const format = useFormatter();
  const formatDate = (value: Date, options: DateTimeFormatOptions) =>
    format.dateTime(value, options);
  const currentLabel = formatAnalyticsDateRange(meta, formatDate);
  const previousLabel = finance.comparison
    ? formatAnalyticsDateRange(finance.comparison, formatDate)
    : undefined;
  return (
    <div className="flex flex-col gap-5">
      <AnalyticsFinanceKpis finance={finance} />
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsRevenueTrendCard
          finance={finance}
          granularity={meta.granularity}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />
        <AnalyticsPaymentMethodCard
          methods={finance.breakdowns.paymentMethods}
          cashReceived={finance.totals.cashReceived}
        />
      </div>
      <div className="flex flex-col gap-5 xl:flex-row">
        <AnalyticsRevenueByServiceCard itemTypes={finance.breakdowns.itemTypes} />
        <AnalyticsPayerMixCard payers={finance.breakdowns.payers} />
        <AnalyticsOutstandingCard outstanding={finance.breakdowns.outstanding} />
      </div>
      <AnalyticsRevenueByDoctorCard
        doctors={finance.breakdowns.doctors}
        previousLabel={previousLabel}
      />
    </div>
  );
}
