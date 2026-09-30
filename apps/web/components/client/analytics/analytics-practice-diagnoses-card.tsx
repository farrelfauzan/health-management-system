'use client';

import type { AnalyticsPracticeBreakdowns } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';

type AnalyticsPracticeDiagnosesCardProps = {
  breakdowns: AnalyticsPracticeBreakdowns;
};

const PERCENT = 100;

/** The clinician's most frequent coded primary diagnoses, bars scaled to the first. */
export function AnalyticsPracticeDiagnosesCard({
  breakdowns,
}: AnalyticsPracticeDiagnosesCardProps) {
  const t = useTranslations('analytics.practice.diagnoses');
  const format = useFormatter();
  const { topDiagnoses, codedEncounters } = breakdowns;
  const largest = Math.max(0, ...topDiagnoses.map((row) => row.count));
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-[2_1_0]">
      {topDiagnoses.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {topDiagnoses.map((row) => (
              <li key={row.code} className="flex flex-col gap-1">
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="w-[56px] shrink-0 font-mono text-xs text-slate-500">
                    {row.code}
                  </span>
                  <span className="grow truncate text-slate-900">{row.name ?? row.code}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {format.number(row.count)}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="h-1.5 overflow-hidden rounded-full bg-surface-container-low"
                >
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${largest > 0 ? (row.count / largest) * PERCENT : 0}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-auto text-xs text-slate-400">
            {t('footnote', { coded: format.number(codedEncounters) })}
          </p>
        </>
      )}
    </AnalyticsCard>
  );
}
