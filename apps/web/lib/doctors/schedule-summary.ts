import type { DoctorScheduleEntry } from '@hms/shared-types';

import { formatDayOfWeekLabel } from '#lib/doctors/day-of-week-label';

function formatDayRange(rangeStart: number, rangeEnd: number): string {
  if (rangeStart === rangeEnd) {
    return formatDayOfWeekLabel(rangeStart);
  }
  return `${formatDayOfWeekLabel(rangeStart)}–${formatDayOfWeekLabel(rangeEnd)}`;
}

function compressDayLabels(days: number[]): string {
  const [firstDay, ...restDays] = days;
  if (firstDay === undefined) {
    return '';
  }
  const ranges: string[] = [];
  let rangeStart = firstDay;
  let previous = firstDay;
  for (const day of restDays) {
    if (day === previous + 1) {
      previous = day;
      continue;
    }
    ranges.push(formatDayRange(rangeStart, previous));
    rangeStart = day;
    previous = day;
  }
  ranges.push(formatDayRange(rangeStart, previous));
  return ranges.join(', ');
}

export function formatScheduleSummary(schedules: DoctorScheduleEntry[]): string {
  const availableEntries = schedules.filter((entry) => entry.isAvailable);
  if (availableEntries.length === 0) {
    return 'No schedule';
  }
  const days = [...new Set(availableEntries.map((entry) => entry.dayOfWeek))].sort(
    (a, b) => a - b,
  );
  const dayLabel = compressDayLabels(days);
  const uniqueTimeRanges = new Set(
    availableEntries.map((entry) => `${entry.startTime}–${entry.endTime}`),
  );
  if (uniqueTimeRanges.size === 1) {
    return `${dayLabel} · ${[...uniqueTimeRanges][0]}`;
  }
  return `${dayLabel} · varies`;
}
