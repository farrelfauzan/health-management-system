import { addCalendarDays, addCalendarMonths } from '@hms/shared-types';

import type {
  AnalyticsPeriodPreset,
  AnalyticsPeriodRange,
} from '#lib/analytics/analytics-filter-state';

const MONTH_PREFIX_LENGTH = 7;

function startOfMonth(date: string): string {
  return `${date.slice(0, MONTH_PREFIX_LENGTH)}-01`;
}

function endOfMonth(date: string): string {
  return addCalendarDays(addCalendarMonths(startOfMonth(date), 1), -1);
}

/**
 * The dates a preset stands for, counted from the clinic's today. "Bulan ini"
 * and "Bulan lalu" are whole calendar months, so they compare with the whole
 * month before; the rolling presets end today. A custom preset has no dates
 * of its own and answers `null`.
 */
export function resolveAnalyticsPresetRange(
  preset: AnalyticsPeriodPreset,
  today: string,
): AnalyticsPeriodRange | null {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last-7-days':
      return { from: addCalendarDays(today, -6), to: today };
    case 'this-month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'last-month': {
      const previousMonth = addCalendarMonths(startOfMonth(today), -1);
      return { from: previousMonth, to: endOfMonth(previousMonth) };
    }
    case 'last-3-months':
      return { from: addCalendarDays(addCalendarMonths(today, -3), 1), to: today };
    case 'last-12-months':
      return { from: addCalendarDays(addCalendarMonths(today, -12), 1), to: today };
    default:
      return null;
  }
}
