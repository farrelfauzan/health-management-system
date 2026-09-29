'use client';

import type { AnalyticsBusiestHourCell } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { buildBusiestHoursGrid } from '#lib/analytics/build-busiest-hours-grid';

type AnalyticsBusiestHoursCardProps = {
  cells: AnalyticsBusiestHourCell[];
};

const SHADE_CLASSES = [
  'bg-surface-container-low',
  'bg-[#d6e2fb]',
  'bg-[#a9c2f3]',
  'bg-[#5d8ce6]',
  'bg-primary',
];
const WEEKDAY_KEYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

function toWeekdayKey(weekday: number): (typeof WEEKDAY_KEYS)[number] {
  return WEEKDAY_KEYS[weekday - 1] ?? '1';
}

function formatHour(hour: number): string {
  return String(hour).padStart(2, '0');
}

/**
 * Check-ins by weekday and clinic hour (PRD FR-OPS-08). The busiest cell is
 * named in the label for screen readers, and every count sits in a table
 * behind the grid.
 */
export function AnalyticsBusiestHoursCard({ cells }: AnalyticsBusiestHoursCardProps) {
  const t = useTranslations('analytics.operations.busiestHours');
  const format = useFormatter();
  const grid = buildBusiestHoursGrid(cells);
  const ariaLabel = grid.busiest
    ? t('ariaLabel', {
        weekday: t(`weekdaysLong.${toWeekdayKey(grid.busiest.weekday)}`),
        hour: formatHour(grid.busiest.hour),
        count: format.number(grid.busiest.checkIns),
      })
    : t('ariaLabelEmpty');
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      <div role="img" aria-label={ariaLabel} className="flex flex-col gap-[3px]">
        {grid.rows.map((row) => (
          <div key={row.weekday} aria-hidden="true" className="flex items-center gap-[3px]">
            <span className="w-8 shrink-0 text-xs text-slate-500">
              {t(`weekdays.${toWeekdayKey(row.weekday)}`)}
            </span>
            {row.cells.map((cell) => (
              <span
                key={cell.hour}
                title={`${t(`weekdaysLong.${toWeekdayKey(row.weekday)}`)} ${formatHour(cell.hour)}.00 · ${format.number(cell.checkIns)}`}
                className={cn('h-[22px] flex-1 rounded', SHADE_CLASSES[cell.shade])}
              />
            ))}
          </div>
        ))}
        <div aria-hidden="true" className="flex gap-[3px] pl-[35px]">
          {grid.hours.map((hour) => (
            <span key={hour} className="flex-1 text-center text-[11px] text-slate-500">
              {formatHour(hour)}
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="flex items-center gap-1.5 text-xs text-slate-500">
        {t('less')}
        {SHADE_CLASSES.map((shadeClass) => (
          <span key={shadeClass} className={cn('h-2.5 w-[18px] rounded-[3px]', shadeClass)} />
        ))}
        {t('more')}
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">{t('weekday')}</th>
            <th scope="col">{t('hour')}</th>
            <th scope="col">{t('title')}</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <tr key={`${cell.weekday}-${cell.hour}`}>
              <td>{t(`weekdaysLong.${toWeekdayKey(cell.weekday)}`)}</td>
              <td>{formatHour(cell.hour)}.00</td>
              <td>{format.number(cell.checkIns)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AnalyticsCard>
  );
}
