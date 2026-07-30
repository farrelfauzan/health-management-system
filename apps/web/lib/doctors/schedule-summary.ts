import type { DoctorScheduleEntry } from '@hms/shared-types';

import { formatDayOfWeekLabel } from '#lib/doctors/day-of-week-label';

function formatDayRange(
  rangeStart: number,
  rangeEnd: number,
  dayLabel: (day: number) => string,
): string {
  if (rangeStart === rangeEnd) {
    return dayLabel(rangeStart);
  }
  return `${dayLabel(rangeStart)}–${dayLabel(rangeEnd)}`;
}

function compressDayLabels(days: number[], dayLabel: (day: number) => string): string {
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
    ranges.push(formatDayRange(rangeStart, previous, dayLabel));
    rangeStart = day;
    previous = day;
  }
  ranges.push(formatDayRange(rangeStart, previous, dayLabel));
  return ranges.join(', ');
}

type ScheduleSummaryMessages = {
  dayLabel?: (day: number) => string;
  noSchedule?: string;
  varies?: string;
};

export function formatScheduleSummary(
  schedules: DoctorScheduleEntry[],
  messages: ScheduleSummaryMessages = {},
): string {
  const availableEntries = schedules.filter((entry) => entry.isAvailable);
  if (availableEntries.length === 0) {
    return messages.noSchedule ?? 'No schedule';
  }
  const days = [...new Set(availableEntries.map((entry) => entry.dayOfWeek))].sort((a, b) => a - b);
  const dayLabel = compressDayLabels(days, messages.dayLabel ?? formatDayOfWeekLabel);
  const uniqueTimeRanges = new Set(
    availableEntries.map((entry) => `${entry.startTime}–${entry.endTime}`),
  );
  if (uniqueTimeRanges.size === 1) {
    return `${dayLabel} · ${[...uniqueTimeRanges][0]}`;
  }
  return `${dayLabel} · ${messages.varies ?? 'varies'}`;
}
