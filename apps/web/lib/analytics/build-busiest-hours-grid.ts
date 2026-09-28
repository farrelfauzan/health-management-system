import type { AnalyticsBusiestHourCell } from '@hms/shared-types';

import type { BusiestHoursGrid } from '#lib/analytics/analytics-filter-state';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 20;
const SHADE_LEVELS = 4;

/**
 * The heatmap's rows and columns: Monday to Sunday, and the clinic's usual
 * 07–20 widened to any hour that actually had a check-in. Each cell gets a
 * shade from 0 (none) to 4 (the busiest hour), relative to the busiest cell,
 * so a quiet month still shows its pattern.
 */
export function buildBusiestHoursGrid(
  cells: readonly AnalyticsBusiestHourCell[],
): BusiestHoursGrid {
  const hoursWithData = cells.map((cell) => cell.hour);
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...hoursWithData);
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...hoursWithData);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const countByKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.checkIns]));
  const busiest = cells.reduce<AnalyticsBusiestHourCell | null>(
    (best, cell) => (best === null || cell.checkIns > best.checkIns ? cell : best),
    null,
  );
  const maxCount = busiest?.checkIns ?? 0;
  const rows = WEEKDAYS.map((weekday) => ({
    weekday,
    cells: hours.map((hour) => {
      const checkIns = countByKey.get(`${weekday}-${hour}`) ?? 0;
      const shade =
        maxCount > 0 && checkIns > 0
          ? Math.max(1, Math.ceil((checkIns / maxCount) * SHADE_LEVELS))
          : 0;
      return { hour, checkIns, shade };
    }),
  }));
  return { hours, rows, busiest };
}
