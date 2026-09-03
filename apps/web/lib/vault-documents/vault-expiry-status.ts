import type { VaultDocumentExpiryStatus } from '@hms/shared-types';

/**
 * How far ahead of expiry a vault row starts reading as urgent.
 *
 * Matches the widest threshold the owner-only reminder job announces at
 * (`VAULT_DOCUMENT_EXPIRY_THRESHOLD_DAYS`), so the badge appears on the same
 * day the bell does. Two numbers that drifted apart would mean an owner sees
 * a calm-looking list the morning after being told something expires.
 */
export const VAULT_EXPIRY_WARNING_DAYS = 60;

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * A vault document's expiry as its owner sees it (`P16-T18`).
 *
 * A document with no expiry resolves to `NO_EXPIRY` rather than being
 * reported as a problem: most of what a vault holds — an ijazah, a CV, a KTP
 * scan kept for convenience — has no renewal date at all, and a list that
 * flagged them would train its owner to ignore the flag.
 */
export function resolveVaultExpiryStatus(
  expiresAt: string | null,
  today: Date,
): VaultDocumentExpiryStatus {
  if (expiresAt === null) {
    return 'NO_EXPIRY';
  }
  const expiry = new Date(`${expiresAt}T00:00:00.000Z`).getTime();
  if (Number.isNaN(expiry)) {
    return 'NO_EXPIRY';
  }
  const reference = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysRemaining = Math.floor((expiry - reference) / MILLISECONDS_PER_DAY);
  if (daysRemaining < 0) {
    return 'EXPIRED';
  }
  if (daysRemaining <= VAULT_EXPIRY_WARNING_DAYS) {
    return 'EXPIRING_SOON';
  }
  return 'VALID';
}
