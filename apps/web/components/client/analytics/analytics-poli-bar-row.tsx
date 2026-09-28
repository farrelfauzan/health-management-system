'use client';

import { computeChangePercent } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { formatSignedNumber } from '#lib/analytics/format-signed-number';

type AnalyticsPoliBarRowProps = {
  label: string;
  visits: number;
  previousVisits?: number;
  maxVisits: number;
};

const PERCENT = 100;

/**
 * One poli: name, a bar scaled to the busiest poli, the count and — when
 * comparing — the change, written with its sign so the colour is optional.
 */
export function AnalyticsPoliBarRow({
  label,
  visits,
  previousVisits,
  maxVisits,
}: AnalyticsPoliBarRowProps) {
  const t = useTranslations('analytics.operations.poli');
  const format = useFormatter();
  const locale = useLocale();
  const change =
    previousVisits === undefined ? undefined : computeChangePercent(visits, previousVisits);
  const width = maxVisits > 0 ? (visits / maxVisits) * PERCENT : 0;
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-32 shrink-0 truncate text-slate-900" title={label}>
        {label}
      </span>
      <span
        aria-hidden="true"
        className="h-2.5 grow overflow-hidden rounded-full bg-surface-container-low"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </span>
      <span className="w-24 shrink-0 text-right tabular-nums">
        <span className="font-semibold text-slate-900">{format.number(visits)}</span>
        {change === null ? <span className="ml-1.5 text-slate-500">{t('newPoli')}</span> : null}
        {change !== undefined && change !== null ? (
          <span className={cn('ml-1.5 font-medium', change < 0 ? 'text-danger' : 'text-success')}>
            {formatSignedNumber(change, locale)}%
          </span>
        ) : null}
      </span>
    </div>
  );
}
