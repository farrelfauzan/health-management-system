'use client';

import type { AnalyticsCaseMixDiagnosis } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsClinicalCount } from '#components/client/analytics/analytics-clinical-count';

type AnalyticsTopDiagnosesCardProps = {
  diagnoses: AnalyticsCaseMixDiagnosis[];
};

const PERCENT = 100;

/**
 * The ten most frequent coded primary diagnoses, then everything else and
 * the uncoded, so the list covers every finished encounter. A withheld count
 * draws an empty dashed bar rather than a guessed length.
 */
export function AnalyticsTopDiagnosesCard({ diagnoses }: AnalyticsTopDiagnosesCardProps) {
  const t = useTranslations('analytics.caseMix.diagnoses');
  const format = useFormatter();
  // Bars are scaled to the most frequent code: the folded "other" row can be
  // larger than any single code, and would squash every bar above it.
  const largest = Math.max(
    0,
    ...diagnoses.map((row) =>
      row.kind === 'CODE' && typeof row.count === 'number' ? row.count : 0,
    ),
  );
  function label(row: AnalyticsCaseMixDiagnosis): string {
    if (row.kind === 'OTHER') {
      return t('other', { count: format.number(row.otherCodes ?? 0) });
    }
    return row.kind === 'UNCODED' ? t('uncoded') : (row.name ?? row.code ?? '');
  }
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-[2_1_0]">
      {diagnoses.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {diagnoses.map((row) => {
            const isSuppressed = typeof row.count !== 'number';
            const width =
              typeof row.count === 'number' && largest > 0
                ? Math.min(PERCENT, (row.count / largest) * PERCENT)
                : 0;
            return (
              <li key={`${row.kind}-${row.code ?? ''}`} className="flex h-7 items-center gap-3">
                <span className="w-[56px] shrink-0 font-mono text-xs text-slate-500">
                  {row.code ?? '—'}
                </span>
                <span
                  className={cn(
                    'w-[200px] shrink-0 truncate text-[13px]',
                    row.kind === 'CODE' ? 'text-slate-900' : 'text-slate-500',
                  )}
                >
                  {label(row)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-2.5 grow overflow-hidden rounded-full',
                    isSuppressed
                      ? 'border border-dashed border-slate-400'
                      : 'bg-surface-container-low',
                  )}
                >
                  {isSuppressed ? null : (
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        row.kind === 'CODE' ? 'bg-primary' : 'bg-slate-300',
                      )}
                      style={{ width: `${width}%` }}
                    />
                  )}
                </span>
                <span className="w-[96px] shrink-0 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                  <AnalyticsClinicalCount count={row.count} />
                  {row.sharePercent === null
                    ? null
                    : ` · ${format.number(row.sharePercent, { maximumFractionDigits: 1 })}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AnalyticsCard>
  );
}
