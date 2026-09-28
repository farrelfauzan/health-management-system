'use client';

import { useTranslations } from 'next-intl';

import { AnalyticsDataFreshness } from '#components/client/analytics/analytics-data-freshness';
import { AnalyticsErrorState } from '#components/client/analytics/analytics-error-state';
import { AnalyticsFilterBar } from '#components/client/analytics/analytics-filter-bar';
import { AnalyticsLoadingState } from '#components/client/analytics/analytics-loading-state';
import { AnalyticsReportingHealthContent } from '#components/client/analytics/analytics-reporting-health-content';
import { AnalyticsSlowState } from '#components/client/analytics/analytics-slow-state';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import { useAnalyticsFilterNavigation } from '#lib/analytics/use-analytics-filter-navigation';
import { useAnalyticsReportingHealth } from '#lib/analytics/use-analytics-reporting-health';
import { validateAnalyticsFilterRange } from '#lib/analytics/validate-analytics-filter-range';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const QUERY_TIMEOUT_CODE = 'ANALYTICS_QUERY_TIMEOUT';

type AnalyticsReportingHealthPanelProps = {
  filter: AnalyticsFilterState;
  today: string;
  breadcrumbRoot: BreadcrumbTrailItem;
};

/**
 * The Status pelaporan page (P29-T06). Filters by period only: a submission
 * queue has no poli or clinician to narrow by, and nothing to compare.
 */
export function AnalyticsReportingHealthPanel({
  filter,
  today,
  breadcrumbRoot,
}: AnalyticsReportingHealthPanelProps) {
  const t = useTranslations('analytics');
  const navigate = useAnalyticsFilterNavigation();
  const rangeProblem = validateAnalyticsFilterRange(filter);
  const query = useAnalyticsReportingHealth(filter, rangeProblem === null);
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
    if (!query.reportingHealth || !query.reportingHealthMeta) {
      return <AnalyticsLoadingState />;
    }
    return (
      <AnalyticsReportingHealthContent
        reportingHealth={query.reportingHealth}
        generatedAt={query.reportingHealthMeta.generatedAt}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboards.reporting.title')}
        subtitle={t('dashboards.reporting.subtitle')}
        breadcrumbs={[
          breadcrumbRoot,
          { label: t('breadcrumb') },
          { label: t('dashboards.reporting.title') },
        ]}
        actions={
          <AnalyticsDataFreshness
            generatedAt={query.reportingHealthMeta?.generatedAt}
            timeZone={query.reportingHealthMeta?.timezone}
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
        showNarrowing={false}
        showCompare={false}
      />
      {renderBody()}
    </div>
  );
}
