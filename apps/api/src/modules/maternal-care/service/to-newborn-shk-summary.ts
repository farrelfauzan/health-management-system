import {
  NewbornShkSummary,
  ShkScreeningCoreRecord,
  isShkSampleEarly,
  resolveShkScreeningStatus,
} from '@hms/shared-types';

/**
 * The chip on the newborn card (P25-T10): her newest sample, or null when she
 * has none — a stillbirth, or a record that predates SHK tracking.
 */
export function toNewbornShkSummary(
  screenings: readonly ShkScreeningCoreRecord[] | undefined,
  now: Date,
): NewbornShkSummary | null {
  const latest = screenings?.[0];
  if (latest === undefined) {
    return null;
  }
  return {
    id: latest.id,
    sequence: latest.sequence,
    status: resolveShkScreeningStatus({ ...latest, now }),
    dueFrom: latest.dueFrom.toISOString(),
    dueUntil: latest.dueUntil.toISOString(),
    isEarly: isShkSampleEarly(latest),
    result: latest.result,
  };
}
