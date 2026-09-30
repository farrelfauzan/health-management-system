'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AnalyticsDataFreshness } from '#components/client/analytics/analytics-data-freshness';
import { AnalyticsExportButton } from '#components/client/analytics/analytics-export-button';
import { AnalyticsCaseMixContent } from '#components/client/analytics/analytics-case-mix-content';
import { AnalyticsEmptyState } from '#components/client/analytics/analytics-empty-state';
import { AnalyticsErrorState } from '#components/client/analytics/analytics-error-state';
import { AnalyticsFilterBar } from '#components/client/analytics/analytics-filter-bar';
import { AnalyticsLoadingState } from '#components/client/analytics/analytics-loading-state';
import { AnalyticsSlowState } from '#components/client/analytics/analytics-slow-state';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import { useAnalyticsFilterNavigation } from '#lib/analytics/use-analytics-filter-navigation';
import { useAnalyticsCaseMix } from '#lib/analytics/use-analytics-case-mix';
import { validateAnalyticsFilterRange } from '#lib/analytics/validate-analytics-filter-range';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const QUERY_TIMEOUT_CODE = 'ANALYTICS_QUERY_TIMEOUT';

type AnalyticsCaseMixPanelProps = {
  filter: AnalyticsFilterState;
  today: string;
  breadcrumbRoot: BreadcrumbTrailItem;
};

/**
 * The Pola penyakit dashboard (P29-T12). Like Operasional, the URL is the
 * filter's only home; empty means no encounter finished in the period.
 */
export function AnalyticsCaseMixPanel({
  filter,
  today,
  breadcrumbRoot,
}: AnalyticsCaseMixPanelProps) {
  const t = useTranslations('analytics');
  const navigate = useAnalyticsFilterNavigation();
  const rangeProblem = validateAnalyticsFilterRange(filter);
  const query = useAnalyticsCaseMix(filter, rangeProblem === null, {
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
    if (!query.caseMix || !query.caseMixMeta) {
      return <AnalyticsLoadingState />;
    }
    if (query.caseMix.totals.finishedEncounters === 0) {
      return (
        <AnalyticsEmptyState
          hasFilters={hasFilters}
          title={t('caseMix.emptyTitle')}
          description={t('caseMix.emptyDescription')}
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
    return <AnalyticsCaseMixContent caseMix={query.caseMix} filter={filter} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboards.case-mix.title')}
        subtitle={t('dashboards.case-mix.subtitle')}
        breadcrumbs={[
          breadcrumbRoot,
          { label: t('breadcrumb') },
          { label: t('dashboards.case-mix.title') },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AnalyticsDataFreshness
              generatedAt={query.caseMixMeta?.generatedAt}
              timeZone={query.caseMixMeta?.timezone}
              isFetching={query.isFetching}
              onReload={() => void query.refetch()}
            />
            <AnalyticsExportButton
              dashboard="case-mix"
              dashboardTitle={t('dashboards.case-mix.title')}
              filter={filter}
              isDisabled={rangeProblem !== null}
            />
          </div>
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
