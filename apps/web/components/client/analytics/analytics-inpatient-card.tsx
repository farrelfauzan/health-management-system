'use client';

import type { AnalyticsInpatientDisposition, AnalyticsInpatientTotals } from '@hms/shared-types';
import { cn, Icon } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { AnalyticsStatLine } from '#components/client/analytics/analytics-stat-line';

type AnalyticsInpatientCardProps = {
  inpatient: AnalyticsInpatientTotals;
  previous?: AnalyticsInpatientTotals | null;
  dispositions: AnalyticsInpatientDisposition[];
};

const PERCENT = 100;
const DISPOSITIONS = ['HOME', 'AGAINST_ADVICE', 'REFERRED', 'DIED', 'OTHER'] as const;
const DISPOSITION_CLASSES: Readonly<Record<string, string>> = {
  HOME: 'bg-primary',
  REFERRED: 'bg-warning',
  AGAINST_ADVICE: 'bg-outline-variant',
  DIED: 'bg-slate-700',
  OTHER: 'bg-surface-dim',
};

function isKnownDisposition(value: string): value is (typeof DISPOSITIONS)[number] {
  return (DISPOSITIONS as readonly string[]).includes(value);
}

/**
 * Inpatient for the period (PRD FR-OPS-09), shown only when the rooms and
 * inpatient feature is on. Occupancy is clinic-wide even with a clinician
 * chosen, because beds are shared.
 */
export function AnalyticsInpatientCard({
  inpatient,
  previous,
  dispositions,
}: AnalyticsInpatientCardProps) {
  const t = useTranslations('analytics.operations.inpatient');
  const format = useFormatter();
  const days = (value: number | null) =>
    value === null
      ? '—'
      : t('lengthOfStayValue', { days: format.number(value, { maximumFractionDigits: 1 }) });
  const percent = (value: number | null) =>
    value === null ? '—' : `${format.number(value, { maximumFractionDigits: 1 })}%`;
  const vs = (value: string | undefined) => (value === undefined ? undefined : t('vs', { value }));
  const totalDischarges = dispositions.reduce((sum, row) => sum + row.discharges, 0);
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle')}
      className="flex-[3_1_0]"
      action={
        <Link
          href="/admin/admissions"
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          {t('admissionsLink')}
          <Icon name="arrow_forward" size={16} />
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <AnalyticsStatLine
          label={t('admissions')}
          value={format.number(inpatient.admissions)}
          comparison={vs(previous ? format.number(previous.admissions) : undefined)}
        />
        <AnalyticsStatLine
          label={t('discharges')}
          value={format.number(inpatient.discharges)}
          comparison={vs(previous ? format.number(previous.discharges) : undefined)}
        />
        <AnalyticsStatLine
          label={t('lengthOfStay')}
          value={days(inpatient.averageLengthOfStayDays)}
          comparison={vs(previous ? days(previous.averageLengthOfStayDays) : undefined)}
        />
        <AnalyticsStatLine
          label={t('occupancy')}
          value={percent(inpatient.bedOccupancyPercent)}
          comparison={vs(previous ? percent(previous.bedOccupancyPercent) : undefined)}
        />
      </div>
      {totalDischarges > 0 ? (
        <div className="flex flex-col gap-2">
          <div
            aria-hidden="true"
            className="flex h-2.5 overflow-hidden rounded-full bg-surface-container-low"
          >
            {dispositions.map((row) => (
              <span
                key={row.disposition}
                className={DISPOSITION_CLASSES[row.disposition] ?? 'bg-surface-dim'}
                style={{ width: `${(row.discharges / totalDischarges) * PERCENT}%` }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
            {dispositions.map((row) => (
              <li key={row.disposition} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2.5 rounded-[3px]',
                    DISPOSITION_CLASSES[row.disposition] ?? 'bg-surface-dim',
                  )}
                />
                {isKnownDisposition(row.disposition)
                  ? t(`dispositions.${row.disposition}`)
                  : row.disposition}
                <span className="font-semibold text-slate-900 tabular-nums">
                  {format.number(row.discharges)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AnalyticsCard>
  );
}
