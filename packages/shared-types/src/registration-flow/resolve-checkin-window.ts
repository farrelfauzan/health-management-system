import { buildZonedDateTime } from '#appointment-management/schemas';
import { getCalendarDateInTimeZone } from '#registration-flow/schemas';

/**
 * One stretch of the clinic day during which a doctor is actually seeing
 * patients, expressed the way the database stores it: a clinic-local calendar
 * date plus wall-clock `HH:mm` bounds. Never an instant, because a session is
 * authored as "14:00 to 17:00 on Tuesday", and converting that to UTC before
 * the comparison is what makes an 08:00 Asia/Jakarta session unreachable from
 * a UTC CI runner.
 */
export type CheckInPracticeWindow = {
  /** Clinic-local YYYY-MM-DD the window belongs to. */
  date: string;
  /** Clinic-local HH:mm the doctor starts seeing patients. */
  startTime: string;
  /** Clinic-local HH:mm the doctor stops. */
  endTime: string;
  /**
   * An approval-gated special request names one exact instant rather than a
   * stretch, so the early-arrival grace applies on both sides of it. A session
   * gets grace before it opens and none after it ends: someone arriving an
   * hour after the doctor went home is not in that queue.
   */
  kind: 'SESSION' | 'SPECIAL_REQUEST';
};

export type CheckInWindowReason = 'INSIDE' | 'NO_SESSION' | 'BEFORE_OPENING' | 'AFTER_END';

export type ResolveCheckInWindowParams = {
  /** Every practice window the registration's doctor holds, any date. */
  windows: readonly CheckInPracticeWindow[];
  now: Date;
  timeZone: string;
  /** How early a patient may check in before a window opens. */
  graceMinutes: number;
};

/**
 * Whether the desk may check this patient in, and the clinic-local hours to
 * quote back when it may not. Every time is `HH:mm` in the clinic timezone —
 * those are the numbers printed on the door, and they are what the refusal
 * message and the web row both show.
 */
export type CheckInWindowDecision = {
  allowed: boolean;
  reason: CheckInWindowReason;
  /** Absent only when the doctor holds no window on the clinic day at all. */
  sessionStart?: string;
  sessionEnd?: string;
  /** `sessionStart` minus the grace: when the desk may start checking people in. */
  opensAt?: string;
  /** When check-in stops. Equal to `sessionEnd` except for a special request. */
  closesAt?: string;
};

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

type ResolvedWindow = {
  startTime: string;
  endTime: string;
  opensAt: string;
  closesAt: string;
  opensAtMs: number;
  closesAtMs: number;
};

/**
 * Decides whether `now` falls inside one of the doctor's practice windows for
 * the clinic day it lands on, and names the window it compared against.
 *
 * Pure on purpose: the caller loads the rows, this does the timezone
 * arithmetic. That keeps the one part with a real chance of being wrong — an
 * 08:00 Asia/Jakarta session evaluated on a host running UTC — testable
 * without a database.
 */
export function resolveCheckInWindow(params: ResolveCheckInWindowParams): CheckInWindowDecision {
  const { windows, now, timeZone, graceMinutes } = params;
  const today = getCalendarDateInTimeZone(now, timeZone);
  const nowMs = now.getTime();
  const resolved = windows
    .filter((window) => window.date === today)
    .map((window) => resolveWindow(window, timeZone, graceMinutes))
    .sort((left, right) => left.opensAtMs - right.opensAtMs);
  const lastWindow = resolved[resolved.length - 1];
  if (!lastWindow) {
    return { allowed: false, reason: 'NO_SESSION' };
  }
  const current = resolved.find(
    (candidate) => nowMs >= candidate.opensAtMs && nowMs <= candidate.closesAtMs,
  );
  if (current) {
    return buildDecision(current, true, 'INSIDE');
  }
  const upcoming = resolved.find((candidate) => nowMs < candidate.opensAtMs);
  return upcoming
    ? buildDecision(upcoming, false, 'BEFORE_OPENING')
    : buildDecision(lastWindow, false, 'AFTER_END');
}

function resolveWindow(
  window: CheckInPracticeWindow,
  timeZone: string,
  graceMinutes: number,
): ResolvedWindow {
  const isSpecialRequest = window.kind === 'SPECIAL_REQUEST';
  const startMs = toInstantMs(window.date, window.startTime, timeZone);
  const endMs = toInstantMs(window.date, window.endTime, timeZone);
  const graceMs = graceMinutes * MILLISECONDS_PER_MINUTE;
  return {
    startTime: window.startTime,
    endTime: window.endTime,
    opensAt: shiftClockTime(window.startTime, -graceMinutes),
    closesAt: isSpecialRequest ? shiftClockTime(window.endTime, graceMinutes) : window.endTime,
    opensAtMs: startMs - graceMs,
    closesAtMs: isSpecialRequest ? endMs + graceMs : endMs,
  };
}

function toInstantMs(date: string, time: string, timeZone: string): number {
  return buildZonedDateTime({ date, time, timeZone }).getTime();
}

function buildDecision(
  resolved: ResolvedWindow,
  allowed: boolean,
  reason: CheckInWindowReason,
): CheckInWindowDecision {
  return {
    allowed,
    reason,
    sessionStart: resolved.startTime,
    sessionEnd: resolved.endTime,
    opensAt: resolved.opensAt,
    closesAt: resolved.closesAt,
  };
}

/**
 * Moves an `HH:mm` wall-clock label by `offsetMinutes`, clamped to the same
 * day. Clamped rather than wrapped: "check-in opens at 23:00 yesterday" is not
 * a sentence the front desk can act on, and a grace wide enough to cross
 * midnight is a misconfiguration rather than a window.
 */
function shiftClockTime(time: string, offsetMinutes: number): string {
  const [hourPart = '0', minutePart = '0'] = time.split(':');
  const total = Number(hourPart) * MINUTES_PER_HOUR + Number(minutePart) + offsetMinutes;
  const clamped = Math.min(Math.max(total, 0), MINUTES_PER_DAY - 1);
  const hours = Math.floor(clamped / MINUTES_PER_HOUR);
  const minutes = clamped % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
