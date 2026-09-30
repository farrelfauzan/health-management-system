'use client';

import { Icon } from '@hms/ui';
import { keepPreviousData } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AnalyticsDataFreshness } from '#components/client/analytics/analytics-data-freshness';
import { AnalyticsErrorState } from '#components/client/analytics/analytics-error-state';
import { AnalyticsFilterBar } from '#components/client/analytics/analytics-filter-bar';
import { AnalyticsLoadingState } from '#components/client/analytics/analytics-loading-state';
import { AnalyticsPracticeContent } from '#components/client/analytics/analytics-practice-content';
import { AnalyticsSlowState } from '#components/client/analytics/analytics-slow-state';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { PageHeader } from '#components/shared/page-header';
import type { AnalyticsFilterState } from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import { useAnalyticsFilterNavigation } from '#lib/analytics/use-analytics-filter-navigation';
import { useAnalyticsPractice } from '#lib/analytics/use-analytics-practice';
import { validateAnalyticsFilterRange } from '#lib/analytics/validate-analytics-filter-range';
import type { BreadcrumbTrailItem } from '#lib/navigation/breadcrumb-trail-item';

const QUERY_TIMEOUT_CODE = 'ANALYTICS_QUERY_TIMEOUT';
const NO_PROFILE_CODE = 'ANALYTICS_NO_CLINICIAN_PROFILE';

type AnalyticsPracticePanelProps = {
  filter: AnalyticsFilterState;
  today: string;
  breadcrumbRoot: BreadcrumbTrailItem;
};

/**
 * "Praktik saya" (P29-T15) in the clinician shell. Only the period and the
 * comparison are filters: the practice is always the signed-in clinician's,
 * which the note under the filter says in words.
 */
export function AnalyticsPracticePanel({
  filter,
  today,
  breadcrumbRoot,
}: AnalyticsPracticePanelProps) {
  const t = useTranslations('analytics');
  const navigate = useAnalyticsFilterNavigation();
  const rangeProblem = validateAnalyticsFilterRange(filter);
  const query = useAnalyticsPractice(filter, rangeProblem === null, {
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
      if (query.errorCode === NO_PROFILE_CODE) {
        return <InlineNotice tone="info">{t('practice.noProfile')}</InlineNotice>;
      }
      return query.errorCode === QUERY_TIMEOUT_CODE ? (
        <AnalyticsSlowState
          onRetry={() => void query.refetch()}
          onPickThreeMonths={handlePickThreeMonths}
        />
      ) : (
        <AnalyticsErrorState onRetry={() => void query.refetch()} />
      );
    }
    if (!query.practice || !query.practiceMeta) {
      return <AnalyticsLoadingState />;
    }
    return <AnalyticsPracticeContent practice={query.practice} meta={query.practiceMeta} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('practice.title')}
        subtitle={t('practice.subtitle')}
        breadcrumbs={[breadcrumbRoot, { label: t('breadcrumb') }, { label: t('practice.title') }]}
        actions={
          <AnalyticsDataFreshness
            generatedAt={query.practiceMeta?.generatedAt}
            timeZone={query.practiceMeta?.timezone}
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
      />
      <p className="-mt-2 flex items-center gap-1.5 text-[13px] text-slate-500">
        <Icon name="lock" size={16} />
        {t('practice.note')}
      </p>
      {renderBody()}
    </div>
  );
}
