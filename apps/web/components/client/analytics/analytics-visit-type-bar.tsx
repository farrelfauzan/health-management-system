'use client';

import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import type { AnalyticsVisitsByType } from '@hms/shared-types';

type AnalyticsVisitTypeBarProps = {
  visitsByType: AnalyticsVisitsByType[];
};

const PERCENT = 100;
const SEGMENT_CLASSES: Readonly<Record<string, string>> = {
  CONSULTATION: 'bg-primary',
  LAB_ONLY: 'bg-warning',
  ADMISSION: 'bg-success',
};

/** Consultation, lab-only and inpatient visits as one bar, with the counts written out below. */
export function AnalyticsVisitTypeBar({ visitsByType }: AnalyticsVisitTypeBarProps) {
  const t = useTranslations('analytics.operations.visitTypes');
  const format = useFormatter();
  const total = visitsByType.reduce((sum, row) => sum + row.visits, 0);
  return (
    <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-3.5">
      <span className="text-[13px] font-semibold text-slate-900">{t('title')}</span>
      <div
        aria-hidden="true"
        className="flex h-3.5 overflow-hidden rounded-full bg-surface-container-low"
      >
        {visitsByType.map((row) => (
          <span
            key={row.type}
            className={SEGMENT_CLASSES[row.type] ?? 'bg-slate-300'}
            style={{ width: `${total > 0 ? (row.visits / total) * PERCENT : 0}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        {visitsByType.map((row) => (
          <li key={row.type} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('size-2.5 rounded-[3px]', SEGMENT_CLASSES[row.type])}
            />
            {t(row.type)}{' '}
            <span className="font-semibold text-slate-900 tabular-nums">
              {format.number(row.visits)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
