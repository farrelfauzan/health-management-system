'use client';

import { ChartContainer, type ChartConfig } from '@hms/ui/components/chart';
import { Cell, Pie, PieChart } from '@hms/ui/components/chart-primitives';
import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import type { AnalyticsAppointmentOutcome } from '@hms/shared-types';

type AnalyticsAppointmentOutcomesCardProps = {
  outcomes: AnalyticsAppointmentOutcome[];
};

const PERCENT = 100;
const LABELLED_STATUSES = [
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
  'REJECTED',
  'SCHEDULED',
  'CONFIRMED',
  'REQUESTED',
] as const;

type LabelledStatus = (typeof LABELLED_STATUSES)[number];

function isLabelledStatus(status: string): status is LabelledStatus {
  return (LABELLED_STATUSES as readonly string[]).includes(status);
}
const COLOR_BY_STATUS: Readonly<Record<string, string>> = {
  COMPLETED: 'var(--color-primary)',
  NO_SHOW: 'var(--color-warning)',
  CANCELLED: 'var(--color-outline-variant)',
  REJECTED: '#7c3aed',
};
const FALLBACK_COLOR = 'var(--color-surface-dim)';
const SWATCH_BY_STATUS: Readonly<Record<string, string>> = {
  COMPLETED: 'bg-primary',
  NO_SHOW: 'bg-warning',
  CANCELLED: 'bg-outline-variant',
  REJECTED: 'bg-violet-600',
};

/**
 * Appointment outcomes as a donut with the completed share in the middle,
 * and every status written out beside it with its count.
 */
export function AnalyticsAppointmentOutcomesCard({
  outcomes,
}: AnalyticsAppointmentOutcomesCardProps) {
  const t = useTranslations('analytics.operations.outcomes');
  const format = useFormatter();
  const labelOf = (status: string): string => (isLabelledStatus(status) ? t(status) : status);
  const total = outcomes.reduce((sum, row) => sum + row.appointments, 0);
  const completed = outcomes.find((row) => row.status === 'COMPLETED')?.appointments ?? 0;
  const completedShare =
    total > 0 ? format.number((completed / total) * PERCENT, { maximumFractionDigits: 1 }) : '0';
  const summary = outcomes
    .map((row) => `${labelOf(row.status)} ${format.number(row.appointments)}`)
    .join(', ');
  const config: ChartConfig = Object.fromEntries(
    outcomes.map((row) => [
      row.status,
      { label: labelOf(row.status), color: COLOR_BY_STATUS[row.status] ?? FALLBACK_COLOR },
    ]),
  );
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle', { count: format.number(total) })}
      className="flex-1"
    >
      <div className="flex items-center gap-6">
        <div className="relative size-[170px] shrink-0">
          <ChartContainer
            config={config}
            role="img"
            aria-label={t('ariaLabel', { summary })}
            className="aspect-square size-full"
          >
            <PieChart>
              <Pie
                data={outcomes}
                dataKey="appointments"
                nameKey="status"
                innerRadius={56}
                outerRadius={80}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {outcomes.map((row) => (
                  <Cell key={row.status} fill={COLOR_BY_STATUS[row.status] ?? FALLBACK_COLOR} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <span className="text-xl font-bold text-slate-900">{completedShare}%</span>
            <span className="text-xs text-slate-500">{t('completedShare')}</span>
          </div>
        </div>
        <ul className="flex grow flex-col gap-2.5">
          {outcomes.map((row) => (
            <li key={row.status} className="flex items-center gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2.5 rounded-[3px]',
                  SWATCH_BY_STATUS[row.status] ?? 'bg-surface-dim',
                )}
              />
              <span className="grow">{labelOf(row.status)}</span>
              <strong className="font-semibold tabular-nums">
                {format.number(row.appointments)}
              </strong>
            </li>
          ))}
        </ul>
      </div>
    </AnalyticsCard>
  );
}
