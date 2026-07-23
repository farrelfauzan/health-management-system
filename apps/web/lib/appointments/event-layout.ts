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

function clampRangeToCalendarGrid(
  startMinutes: number,
  endMinutes: number,
): DayEventPlacement | null {
  if (endMinutes <= 0 || startMinutes >= CALENDAR_GRID_HEIGHT_PX) {
    return null;
  }
  const clampedTop = Math.max(0, startMinutes);
  const clampedBottom = Math.min(CALENDAR_GRID_HEIGHT_PX, endMinutes);
  const heightPx = Math.max(clampedBottom - clampedTop, MIN_EVENT_HEIGHT_PX);
  const topPx = Math.min(clampedTop, CALENDAR_GRID_HEIGHT_PX - heightPx);
  return { topPx, heightPx };
}

export function layoutDaySessionBlock(params: {
  sessionDate: string;
  startTime: string;
  endTime: string;
  day: Date;
}): DayEventPlacement | null {
  const { sessionDate, startTime, endTime, day } = params;
  const startsAt = new Date(`${sessionDate}T${startTime}`);
  const endsAt = new Date(`${sessionDate}T${endTime}`);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }
  if (!isSameDay(startsAt, day)) {
    return null;
  }
  return clampRangeToCalendarGrid(
    getMinutesFromCalendarStart(startsAt),
    getMinutesFromCalendarStart(endsAt),
  );
}

export function layoutWeekSessionBlock(params: {
  sessionDate: string;
  startTime: string;
  endTime: string;
  weekStart: Date;
}): WeekEventPlacement | null {
  const { sessionDate, startTime, weekStart } = params;
  const startsAt = new Date(`${sessionDate}T${startTime}`);
  if (Number.isNaN(startsAt.getTime())) {
    return null;
  }
  const dayIndex = Array.from({ length: DAYS_PER_WEEK }, (_, index) => index).find((index) =>
    isSameDay(startsAt, addDays(weekStart, index)),
  );
  if (dayIndex === undefined) {
    return null;
  }
  const placement = layoutDaySessionBlock({ ...params, day: startsAt });
  if (!placement) {
    return null;
  }
  return { dayIndex, ...placement };
}

export type SessionColumnPlacement = DayEventPlacement & {
  columnIndex: number;
  columnCount: number;
};

export type WeekSessionColumnPlacement = SessionColumnPlacement & {
  dayIndex: number;
};

type SessionWindow = {
  sessionDate: string;
  startTime: string;
  endTime: string;
};

function getMinutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

export function layoutDaySessionColumns(params: {
  sessions: SessionWindow[];
  day: Date;
}): Array<SessionColumnPlacement | null> {
  const { sessions, day } = params;
  const positioned = sessions
    .map((session, index) => {
      const placement = layoutDaySessionBlock({ ...session, day });
      if (!placement) {
        return null;
      }
      return {
        index,
        placement,
        startMinutes: getMinutesOfDay(session.startTime),
        endMinutes: getMinutesOfDay(session.endTime),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  const results: Array<SessionColumnPlacement | null> = sessions.map(() => null);
  let cluster: typeof positioned = [];
  let clusterEndMinutes = Number.NEGATIVE_INFINITY;
  function flushCluster(): void {
    if (cluster.length === 0) {
      return;
    }
    const columnEndMinutes: number[] = [];
    const assignments = cluster.map((entry) => {
      let columnIndex = columnEndMinutes.findIndex((end) => end <= entry.startMinutes);
      if (columnIndex === -1) {
        columnIndex = columnEndMinutes.length;
        columnEndMinutes.push(entry.endMinutes);
      } else {
        columnEndMinutes[columnIndex] = entry.endMinutes;
      }
      return { entry, columnIndex };
    });
    for (const { entry, columnIndex } of assignments) {
      results[entry.index] = {
        ...entry.placement,
        columnIndex,
        columnCount: columnEndMinutes.length,
      };
    }
    cluster = [];
  }
  for (const entry of positioned) {
    if (entry.startMinutes >= clusterEndMinutes) {
      flushCluster();
      clusterEndMinutes = entry.endMinutes;
    } else {
      clusterEndMinutes = Math.max(clusterEndMinutes, entry.endMinutes);
    }
    cluster.push(entry);
  }
  flushCluster();
  return results;
}

export function layoutWeekSessionColumns(params: {
  sessions: SessionWindow[];
  weekStart: Date;
}): Array<WeekSessionColumnPlacement | null> {
  const { sessions, weekStart } = params;
  const results: Array<WeekSessionColumnPlacement | null> = sessions.map(() => null);
  for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex += 1) {
    const day = addDays(weekStart, dayIndex);
    const daySessions = sessions
      .map((session, index) => ({ session, index }))
      .filter(({ session }) =>
        isSameDay(new Date(`${session.sessionDate}T${session.startTime}`), day),
      );
    if (daySessions.length === 0) {
      continue;
    }
    const placements = layoutDaySessionColumns({
      sessions: daySessions.map(({ session }) => session),
      day,
    });
    placements.forEach((placement, position) => {
      const target = daySessions[position];
      if (placement && target) {
        results[target.index] = { ...placement, dayIndex };
      }
    });
  }
  return results;
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
