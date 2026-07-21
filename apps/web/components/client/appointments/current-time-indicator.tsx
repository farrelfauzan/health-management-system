'use client';

import { useEffect, useState } from 'react';

import {
  CALENDAR_GRID_HEIGHT_PX,
  getMinutesFromCalendarStart,
} from '#lib/appointments/event-layout';
import { isSameDay } from '#lib/appointments/week-range';

const REFRESH_INTERVAL_MS = 60_000;
const TIME_COLUMN_WIDTH_PX = 80;

type CurrentTimeIndicatorProps = {
  weekDays: Date[];
};

export function CurrentTimeIndicator({ weekDays }: CurrentTimeIndicatorProps) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
  if (!now) {
    return null;
  }
  const isTodayVisible = weekDays.some((day) => isSameDay(day, now));
  const topPx = getMinutesFromCalendarStart(now);
  if (!isTodayVisible || topPx < 0 || topPx > CALENDAR_GRID_HEIGHT_PX) {
    return null;
  }
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute right-0 z-30 flex items-center"
      style={{ top: `${topPx}px`, left: `${TIME_COLUMN_WIDTH_PX}px` }}
    >
      <span className="-ml-1.5 size-3 rounded-full bg-error shadow-sm" />
      <span className="h-0.5 flex-1 bg-error" />
    </div>
  );
}
