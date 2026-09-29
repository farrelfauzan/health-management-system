'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type AnalyticsEmptyStateProps = {
  hasFilters: boolean;
  onClearFilters: () => void;
  /** What the dashboard found none of; the visit wording when omitted. */
  title?: string;
  description?: string;
};

/** Nothing in the period: says so, instead of a page of zeros that reads as a broken chart. */
export function AnalyticsEmptyState({
  hasFilters,
  onClearFilters,
  title,
  description,
}: AnalyticsEmptyStateProps) {
  const t = useTranslations('analytics.states');
  return (
    <section className="flex min-h-72 flex-col items-center justify-center gap-2.5 rounded-[14px] border border-slate-200 bg-white p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-container-low text-primary">
        <Icon name="query_stats" size={24} />
      </span>
      <h2 className="text-base font-semibold text-slate-900">{title ?? t('emptyTitle')}</h2>
      <p className="max-w-80 text-[13px] text-slate-500">{description ?? t('emptyDescription')}</p>
      {hasFilters ? (
        <Button type="button" variant="outline" onClick={onClearFilters}>
          <Icon name="filter_alt_off" size={18} />
          {t('clearFilters')}
        </Button>
      ) : null}
    </section>
  );
}
