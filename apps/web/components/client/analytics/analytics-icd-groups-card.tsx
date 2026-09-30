'use client';

import type { AnalyticsCaseMixGroup } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsClinicalCount } from '#components/client/analytics/analytics-clinical-count';

type AnalyticsIcdGroupsCardProps = {
  groups: AnalyticsCaseMixGroup[];
};

const GROUP_LETTERS = /^[A-Z]$/;

/**
 * Finished encounters by the letter group of their primary diagnosis code,
 * which is how ICD-10 cuts its chapters: five groups, the rest, and the
 * uncoded, as shares of every finished encounter.
 */
export function AnalyticsIcdGroupsCard({ groups }: AnalyticsIcdGroupsCardProps) {
  const t = useTranslations('analytics.caseMix.groups');
  const namesT = useTranslations('analytics.caseMix.groups.names');
  const format = useFormatter();
  function label(row: AnalyticsCaseMixGroup): string {
    if (row.kind === 'OTHER') {
      return t('other', { count: format.number(row.otherGroups ?? 0) });
    }
    if (row.kind === 'UNCODED' || row.group === null) {
      return t('uncoded');
    }
    return GROUP_LETTERS.test(row.group)
      ? namesT(row.group as Parameters<typeof namesT>[0])
      : row.group;
  }
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      <ul className="flex flex-col gap-2">
        {groups.map((row) => (
          <li
            key={`${row.kind}-${row.group ?? ''}`}
            className="flex items-center gap-3 text-[13px]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-container-low font-mono text-xs font-semibold text-primary">
              {row.kind === 'CODE' ? row.group : row.kind === 'OTHER' ? '…' : '—'}
            </span>
            <span className="grow text-slate-900">{label(row)}</span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {row.sharePercent === null ? (
                <AnalyticsClinicalCount count={row.count} />
              ) : (
                `${format.number(row.sharePercent, { maximumFractionDigits: 1 })}%`
              )}
            </span>
          </li>
        ))}
      </ul>
    </AnalyticsCard>
  );
}
