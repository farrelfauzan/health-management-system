'use client';

import { useAbility } from '@hms/ui';
import { keepPreviousData } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AnalyticsDataFreshness } from '#components/client/analytics/analytics-data-freshness';
import { AnalyticsErrorState } from '#components/client/analytics/analytics-error-state';
import { AnalyticsExportButton } from '#components/client/analytics/analytics-export-button';
import { AnalyticsFilterBar } from '#components/client/analytics/analytics-filter-bar';
import { AnalyticsLoadingState } from '#components/client/analytics/analytics-loading-state';
import { AnalyticsLaboratoryContent } from '#components/client/analytics/analytics-laboratory-content';
import { AnalyticsSlowState } from '#components/client/analytics/analytics-slow-state';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import { useAnalyticsFilterNavigation } from '#lib/analytics/use-analytics-filter-navigation';
import { useAnalyticsLaboratory } from '#lib/analytics/use-analytics-laboratory';
import { validateAnalyticsFilterRange } from '#lib/analytics/validate-analytics-filter-range';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const QUERY_TIMEOUT_CODE = 'ANALYTICS_QUERY_TIMEOUT';

type AnalyticsLaboratoryPanelProps = {
  filter: AnalyticsFilterState;
  today: string;
  breadcrumbRoot: BreadcrumbTrailItem;
};

/**
 * The Laboratorium dashboard (P29-T14). The URL is the filter's only home.
 * An empty period needs no page of its own: each card says "nothing yet".
 */
export function AnalyticsLaboratoryPanel({
  filter,
  today,
  breadcrumbRoot,
}: AnalyticsLaboratoryPanelProps) {
  const t = useTranslations('analytics');
  const ability = useAbility();
  // The poli and clinician lists need `doctor.read`, which a lab technician
  // does not hold; the payer filter needs nothing.
  const canNarrowByClinician = ability.can('read', 'Doctor');
  const navigate = useAnalyticsFilterNavigation();
  const rangeProblem = validateAnalyticsFilterRange(filter);
  const query = useAnalyticsLaboratory(filter, rangeProblem === null, {
    placeholderData: keepPreviousData,
  });
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
    if (!query.laboratory || !query.laboratoryMeta) {
      return <AnalyticsLoadingState />;
    }
    return <AnalyticsLaboratoryContent laboratory={query.laboratory} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboards.laboratory.title')}
        subtitle={t('dashboards.laboratory.subtitle')}
        breadcrumbs={[
          breadcrumbRoot,
          { label: t('breadcrumb') },
          { label: t('dashboards.laboratory.title') },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <AnalyticsDataFreshness
              generatedAt={query.laboratoryMeta?.generatedAt}
              timeZone={query.laboratoryMeta?.timezone}
              isFetching={query.isFetching}
              onReload={() => void query.refetch()}
            />
            <AnalyticsExportButton
              dashboard="laboratory"
              dashboardTitle={t('dashboards.laboratory.title')}
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
        showClinicianFilters={canNarrowByClinician}
      />
      {renderBody()}
    </div>
  );
}
