import { addDays, isSameDay } from '#lib/appointments/week-range';

export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 18;
export const HOUR_HEIGHT_PX = 60;
export const CALENDAR_GRID_HEIGHT_PX = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT_PX;

const DEFAULT_EVENT_DURATION_MINUTES = 60;
const MIN_EVENT_HEIGHT_PX = 30;
const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;

export type WeekEventPlacement = {
  dayIndex: number;
  topPx: number;
  heightPx: number;
};

export function getMinutesFromCalendarStart(date: Date): number {
  return (
    (date.getHours() - CALENDAR_START_HOUR) * MINUTES_PER_HOUR +
    date.getMinutes()
  );
}

export type DayEventPlacement = {
  topPx: number;
  heightPx: number;
};

function clampToCalendarGrid(startMinutes: number): DayEventPlacement | null {
  const endMinutes = startMinutes + DEFAULT_EVENT_DURATION_MINUTES;
  if (endMinutes <= 0 || startMinutes >= CALENDAR_GRID_HEIGHT_PX) {
    return null;
  }
  const clampedTop = Math.max(0, startMinutes);
  const clampedBottom = Math.min(CALENDAR_GRID_HEIGHT_PX, endMinutes);
  const heightPx = Math.max(clampedBottom - clampedTop, MIN_EVENT_HEIGHT_PX);
  const topPx = Math.min(clampedTop, CALENDAR_GRID_HEIGHT_PX - heightPx);
  return { topPx, heightPx };
}

export function layoutDayEvent(params: {
  scheduledAt: string;
  day: Date;
}): DayEventPlacement | null {
  const { scheduledAt, day } = params;
  const startsAt = new Date(scheduledAt);
  if (Number.isNaN(startsAt.getTime()) || !isSameDay(startsAt, day)) {
    return null;
  }
  return clampToCalendarGrid(getMinutesFromCalendarStart(startsAt));
}

export function layoutWeekEvent(params: {
  scheduledAt: string;
  weekStart: Date;
}): WeekEventPlacement | null {
  const { scheduledAt, weekStart } = params;
  const startsAt = new Date(scheduledAt);
  if (Number.isNaN(startsAt.getTime())) {
    return null;
  }
  const dayIndex = Array.from({ length: DAYS_PER_WEEK }, (_, index) => index).find((index) =>
    isSameDay(startsAt, addDays(weekStart, index)),
  );
  if (dayIndex === undefined) {
    return null;
  }
  const placement = clampToCalendarGrid(getMinutesFromCalendarStart(startsAt));
  if (!placement) {
    return null;
  }
  return { dayIndex, ...placement };
}
