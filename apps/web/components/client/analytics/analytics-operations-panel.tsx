'use client';

import { keepPreviousData } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AnalyticsDataFreshness } from '#components/client/analytics/analytics-data-freshness';
import { AnalyticsExportButton } from '#components/client/analytics/analytics-export-button';
import { AnalyticsEmptyState } from '#components/client/analytics/analytics-empty-state';
import { AnalyticsErrorState } from '#components/client/analytics/analytics-error-state';
import { AnalyticsFilterBar } from '#components/client/analytics/analytics-filter-bar';
import { AnalyticsLoadingState } from '#components/client/analytics/analytics-loading-state';
import { AnalyticsOperationsContent } from '#components/client/analytics/analytics-operations-content';
import { AnalyticsSlowState } from '#components/client/analytics/analytics-slow-state';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import { toAnalyticsFilterSearchParams } from '#lib/analytics/to-analytics-filter-search-params';
import { useAnalyticsFilterNavigation } from '#lib/analytics/use-analytics-filter-navigation';
import { useAnalyticsOperations } from '#lib/analytics/use-analytics-operations';
import { validateAnalyticsFilterRange } from '#lib/analytics/validate-analytics-filter-range';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const QUERY_TIMEOUT_CODE = 'ANALYTICS_QUERY_TIMEOUT';
const REPORTING_PATH = '/admin/analytics/reporting';

/** The reporting status page for the same period; poli and clinician do not apply there. */
function buildReportingHref(filter: AnalyticsFilterState): string {
  const query = toAnalyticsFilterSearchParams({
    ...filter,
    specialtyId: undefined,
    doctorId: undefined,
  });
  return query ? `${REPORTING_PATH}?${query}` : REPORTING_PATH;
}

type AnalyticsOperationsPanelProps = {
  filter: AnalyticsFilterState;
  today: string;
  breadcrumbRoot: BreadcrumbTrailItem;
};

/**
 * The Operasional dashboard (P29-T05). The URL is the filter's only home:
 * every change is written there and the server page hands it back, so a
 * reload or a shared link shows exactly this view.
 */
export function AnalyticsOperationsPanel({
  filter,
  today,
  breadcrumbRoot,
}: AnalyticsOperationsPanelProps) {
  const t = useTranslations('analytics');
  const navigate = useAnalyticsFilterNavigation();
  const rangeProblem = validateAnalyticsFilterRange(filter);
  const query = useAnalyticsOperations(filter, rangeProblem === null, {
    placeholderData: keepPreviousData,
  });
  const hasFilters = Boolean(filter.specialtyId || filter.doctorId);
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
    if (!query.operations || !query.operationsMeta) {
      return <AnalyticsLoadingState />;
    }
    if (query.operations.totals.visits === 0 && query.operations.totals.appointments === 0) {
      return (
        <AnalyticsEmptyState
          hasFilters={hasFilters}
          onClearFilters={() =>
            navigate({ ...filter, specialtyId: undefined, doctorId: undefined })
          }
        />
      );
    }
    return (
      <AnalyticsOperationsContent
        operations={query.operations}
        meta={query.operationsMeta}
        reportingHref={buildReportingHref(filter)}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboards.operations.title')}
        subtitle={t('dashboards.operations.subtitle')}
        breadcrumbs={[
          breadcrumbRoot,
          { label: t('breadcrumb') },
          { label: t('dashboards.operations.title') },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AnalyticsDataFreshness
              generatedAt={query.operationsMeta?.generatedAt}
              timeZone={query.operationsMeta?.timezone}
              isFetching={query.isFetching}
              onReload={() => void query.refetch()}
            />
            <AnalyticsExportButton
              dashboard="operations"
              dashboardTitle={t('dashboards.operations.title')}
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
      {filter.payerType ? <InlineNotice tone="info">{t('filter.payerScope')}</InlineNotice> : null}
      {renderBody()}
    </div>
  );
}
