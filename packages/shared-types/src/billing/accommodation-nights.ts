import { getCalendarDateInTimeZone, getStartOfCalendarDateInTimeZone } from '#registration-flow/schemas';
import type { RoomClassSummaryRecord } from '#room-management/types';

/** One closed stretch of a stay in one bed, as IMP-11 records it. */
export type AccommodationStayInterval = {
  readonly roomClass: RoomClassSummaryRecord;
  readonly startedAt: Date;
  readonly endedAt: Date;
};

export type AccommodationNightTally = {
  readonly roomClass: RoomClassSummaryRecord;
  readonly nights: number;
};

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * How many nights a stay is billed for, and at which ward class each one was
 * spent (IMP-15).
 *
 * **A night is a clinic-local midnight the patient was in a bed for**, which
 * is how Indonesian clinics bill accommodation and the only definition that
 * survives the two cases the card names. Counting elapsed 24-hour periods
 * would bill a 09:00-to-09:00 stay the same as a 23:00-to-01:00 one; counting
 * calendar days would double-bill the day of a transfer. Midnights do neither,
 * and they cross a month boundary without noticing there was one.
 *
 * Each midnight is attributed to the interval that **contains** it —
 * `startedAt < midnight <= endedAt` — so the class charged is the bed the
 * patient actually slept in. A transfer that lands exactly on midnight is a
 * deliberate tie: the patient was in the old bed up to that instant, so the
 * night belongs to the old class.
 *
 * A stay that opens and closes without crossing a midnight yields **no
 * nights**, and therefore no accommodation line. Whether a clinic charges a
 * day rate for that is a tariff policy nobody has stated yet, and inventing
 * one here would put a charge on a bill that no rule justifies.
 */
export function tallyAccommodationNights(params: {
  readonly intervals: readonly AccommodationStayInterval[];
  readonly timeZone: string;
}): AccommodationNightTally[] {
  const { intervals, timeZone } = params;

  if (intervals.length === 0) {
    return [];
  }

  const earliestMs = Math.min(...intervals.map((interval) => interval.startedAt.getTime()));
  const latestMs = Math.max(...intervals.map((interval) => interval.endedAt.getTime()));
  // Keyed by class id rather than by the class object, because two intervals
  // in the same class carry two equal-but-distinct summaries and a Map keyed
  // on the object would count them as two classes.
  const nightsByClassId = new Map<string, AccommodationNightTally>();

  for (const midnight of listClinicMidnights({ earliestMs, latestMs, timeZone })) {
    const interval = intervals.find(
      (candidate) =>
        candidate.startedAt.getTime() < midnight && midnight <= candidate.endedAt.getTime(),
    );

    if (!interval) {
      continue;
    }

    const tally = nightsByClassId.get(interval.roomClass.id);
    nightsByClassId.set(
      interval.roomClass.id,
      { roomClass: interval.roomClass, nights: (tally?.nights ?? 0) + 1 },
    );
  }

  return [...nightsByClassId.values()];
}

/**
 * Every clinic-local midnight strictly inside `(earliestMs, latestMs]`, as
 * epoch milliseconds. Walks calendar dates rather than adding 24 hours
 * repeatedly, so a zone with DST would still land on real midnights — the
 * Indonesian zones have none, but a drift bug that only appears abroad is not
 * worth the saved line.
 */
function listClinicMidnights(params: {
  readonly earliestMs: number;
  readonly latestMs: number;
  readonly timeZone: string;
}): number[] {
  const { earliestMs, latestMs, timeZone } = params;
  const lastDate = getCalendarDateInTimeZone(new Date(latestMs), timeZone);
  const midnights: number[] = [];
  let currentDate = getCalendarDateInTimeZone(new Date(earliestMs), timeZone);

  while (currentDate <= lastDate) {
    const midnight = getStartOfCalendarDateInTimeZone(currentDate, timeZone).getTime();

    if (midnight > earliestMs && midnight <= latestMs) {
      midnights.push(midnight);
    }

    currentDate = addOneCalendarDay(currentDate);
  }

  return midnights;
}

function addOneCalendarDay(dateValue: string): string {
  const next = new Date(new Date(`${dateValue}T00:00:00Z`).getTime() + MILLISECONDS_PER_DAY);
  return next.toISOString().slice(0, 10);
}
