'use client';

import type { AnalyticsCaseMixProcedure } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsClinicalCount } from '#components/client/analytics/analytics-clinical-count';

type AnalyticsTopProceduresCardProps = {
  procedures: AnalyticsCaseMixProcedure[];
};

/**
 * The most frequent ICD-9-CM procedures on finished encounters. When any
 * count is withheld the card says why, once, underneath.
 */
export function AnalyticsTopProceduresCard({ procedures }: AnalyticsTopProceduresCardProps) {
  const t = useTranslations('analytics.caseMix.procedures');
  const caseMixT = useTranslations('analytics.caseMix');
  const format = useFormatter();
  const hasSuppressed = procedures.some((row) => typeof row.count !== 'number');
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      {procedures.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {procedures.map((row) => (
            <li
              key={`${row.kind}-${row.code ?? ''}`}
              className="flex items-center gap-3 text-[13px]"
            >
              <span className="w-[56px] shrink-0 font-mono text-xs text-slate-500">
                {row.code ?? '—'}
              </span>
              <span className="grow truncate text-slate-900">
                {row.kind === 'OTHER'
                  ? t('other', { count: format.number(row.otherCodes ?? 0) })
                  : (row.name ?? row.code)}
              </span>
              <span className="font-semibold text-slate-900 tabular-nums">
                <AnalyticsClinicalCount count={row.count} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasSuppressed ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Icon name="visibility_off" size={16} />
          {caseMixT('suppressedNote')}
        </p>
      ) : null}
    </AnalyticsCard>
  );
}
