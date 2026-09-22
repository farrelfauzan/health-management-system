import { countDaysBetweenCalendarDates } from '#bpjs-non-capitation/count-days-between-calendar-dates';
import {
  NON_CAPITATION_DUE_SOON_DAYS,
  type NonCapitationClaimStatusValue,
} from '#bpjs-non-capitation/schemas';
import type { NonCapitationClaimStatusInput } from '#bpjs-non-capitation/types';

/**
 * Where one line stands on `today`, all dates in the clinic's timezone
 * (P25-T16). A marked line is `SENT` whatever the date. An unmarked one is
 * `EXPIRED` after its six-month expiry, `LATE` after the filing date,
 * `DUE_SOON` from five days before it through the day itself, else `OPEN`.
 */
export function resolveNonCapitationClaimStatus(
  input: NonCapitationClaimStatusInput,
): NonCapitationClaimStatusValue {
  if (input.isMarked) {
    return 'SENT';
  }
  if (input.today > input.expiresOn) {
    return 'EXPIRED';
  }
  const daysLeft = countDaysBetweenCalendarDates(input.today, input.filingDeadline);
  if (daysLeft < 0) {
    return 'LATE';
  }
  return daysLeft <= NON_CAPITATION_DUE_SOON_DAYS ? 'DUE_SOON' : 'OPEN';
}
