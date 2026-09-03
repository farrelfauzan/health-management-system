import type { VaultDocumentShareView } from '@hms/shared-types';

/**
 * How old an open-ended share has to be before its owner is reminded it is
 * still open (FR-E3-20).
 *
 * Ninety days rather than a shorter window because a standing share is often
 * deliberate — a practice manager who holds a copy of everyone's STR is not a
 * mistake. The reminder exists so a share made for one afternoon is not still
 * live a year later, not to nag someone out of a decision they meant.
 */
export const STANDING_SHARE_REMINDER_DAYS = 90;

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Whether this share is live, open-ended, and old enough to be worth
 * surfacing back to its owner. Standing shares should be visible, not buried.
 */
export function isStandingShare(share: VaultDocumentShareView, now: Date): boolean {
  if (!share.isLive || share.expiresAt !== null) {
    return false;
  }
  const ageDays = (now.getTime() - new Date(share.createdAt).getTime()) / MILLISECONDS_PER_DAY;
  return ageDays >= STANDING_SHARE_REMINDER_DAYS;
}
