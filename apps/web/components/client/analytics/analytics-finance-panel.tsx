'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AnalyticsDataFreshness } from '#components/client/analytics/analytics-data-freshness';
import { AnalyticsEmptyState } from '#components/client/analytics/analytics-empty-state';
import { AnalyticsErrorState } from '#components/client/analytics/analytics-error-state';
import { AnalyticsFilterBar } from '#components/client/analytics/analytics-filter-bar';
import { AnalyticsFinanceContent } from '#components/client/analytics/analytics-finance-content';
import { AnalyticsLoadingState } from '#components/client/analytics/analytics-loading-state';
import { AnalyticsSlowState } from '#components/client/analytics/analytics-slow-state';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import { useAnalyticsFilterNavigation } from '#lib/analytics/use-analytics-filter-navigation';
import { useAnalyticsFinance } from '#lib/analytics/use-analytics-finance';
import { validateAnalyticsFilterRange } from '#lib/analytics/validate-analytics-filter-range';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const QUERY_TIMEOUT_CODE = 'ANALYTICS_QUERY_TIMEOUT';

type AnalyticsFinancePanelProps = {
  filter: AnalyticsFilterState;
  today: string;
  breadcrumbRoot: BreadcrumbTrailItem;
};

/**
 * The Keuangan dashboard (P29-T09). Like Operasional, the URL is the
 * filter's only home. Empty means nothing was invoiced, paid or owed: a
 * period with no new invoice can still hold unpaid bills from earlier.
 */
export function AnalyticsFinancePanel({
  filter,
  today,
  breadcrumbRoot,
}: AnalyticsFinancePanelProps) {
  const t = useTranslations('analytics');
  const navigate = useAnalyticsFilterNavigation();
  const rangeProblem = validateAnalyticsFilterRange(filter);
  const query = useAnalyticsFinance(filter, rangeProblem === null, {
    placeholderData: keepPreviousData,
  });
  const hasFilters = Boolean(filter.specialtyId || filter.doctorId || filter.payerType);
  function handlePickThreeMonths(): void {
    const range = resolveAnalyticsPresetRange('last-3-months', today);
    navigate({ ...filter, preset: 'last-3-months', ...range });
  }
  function renderBody() {
    if (rangeProblem !== null) {
      return null;
    }
    if (query.isError) {
      return query.errorCode === QUERY_TIMEOUT_CODE ? (
        <AnalyticsSlowState
          onRetry={() => void query.refetch()}
          onPickThreeMonths={handlePickThreeMonths}
        />
      ) : (
        <AnalyticsErrorState onRetry={() => void query.refetch()} />
      );
    }
    if (!query.finance || !query.financeMeta) {
      return <AnalyticsLoadingState />;
    }
    const { totals, breakdowns } = query.finance;
    if (totals.invoices === 0 && totals.payments === 0 && breakdowns.outstanding.invoices === 0) {
      return (
        <AnalyticsEmptyState
          hasFilters={hasFilters}
          title={t('finance.emptyTitle')}
          description={t('finance.emptyDescription')}
          onClearFilters={() =>
            navigate({
              ...filter,
              specialtyId: undefined,
              doctorId: undefined,
              payerType: undefined,
            })
          }
        />
      );
    }
    return <AnalyticsFinanceContent finance={query.finance} meta={query.financeMeta} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboards.finance.title')}
        subtitle={t('dashboards.finance.subtitle')}
        breadcrumbs={[
          breadcrumbRoot,
          { label: t('breadcrumb') },
          { label: t('dashboards.finance.title') },
        ]}
        actions={
          <AnalyticsDataFreshness
            generatedAt={query.financeMeta?.generatedAt}
            timeZone={query.financeMeta?.timezone}
            isFetching={query.isFetching}
            onReload={() => void query.refetch()}
          />
        }
      />
      <AnalyticsFilterBar
        state={filter}
        today={today}
        rangeProblem={rangeProblem}
        onChange={navigate}
      />
      {renderBody()}
    </div>
  );
}
