import type { ShkScreeningStatusValue } from '#shk-screening/schemas';
import type { ShkStatusInput } from '#shk-screening/types';

/**
 * Where one SHK sample stands (P25-T10).
 *
 * Both window edges are inclusive: exactly 48 h after birth is DUE, and so is
 * exactly 72 h; one minute later is OVERDUE. What has happened outranks the
 * clock — a sample taken late is TAKEN, not OVERDUE, because the question the
 * worklist answers is "who still has to be pricked".
 */
export function resolveShkScreeningStatus(input: ShkStatusInput): ShkScreeningStatusValue {
  if (input.resultReceivedAt !== null) {
    return 'RESULTED';
  }
  if (input.sentAt !== null) {
    return 'SENT';
  }
  if (input.sampleTakenAt !== null) {
    return 'TAKEN';
  }
  const now = input.now.getTime();
  if (now < input.dueFrom.getTime()) {
    return 'UPCOMING';
  }
  return now <= input.dueUntil.getTime() ? 'DUE' : 'OVERDUE';
}
