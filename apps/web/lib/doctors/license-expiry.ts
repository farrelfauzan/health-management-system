export type LicenseExpiryStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'VALID' | 'NO_EXPIRY';

/**
 * A SIP is time-limited and a clinic is audited on it, so "expires in three
 * weeks" has to read differently from "expires in two years". STR carries no
 * expiry under UU Kesehatan 17/2023 and resolves to NO_EXPIRY rather than
 * being reported as a problem.
 */
export const LICENSE_EXPIRY_WARNING_DAYS = 60;

const MILLISECONDS_PER_DAY = 86_400_000;

export function resolveLicenseExpiryStatus(
  expiresAt: string | undefined,
  today: Date,
): LicenseExpiryStatus {
  if (!expiresAt) {
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
  if (daysRemaining <= LICENSE_EXPIRY_WARNING_DAYS) {
    return 'EXPIRING_SOON';
  }
  return 'VALID';
}

export const LICENSE_EXPIRY_CLASSES: Record<LicenseExpiryStatus, string> = {
  EXPIRED: 'bg-danger-tint text-danger',
  EXPIRING_SOON: 'bg-warning-tint text-warning',
  VALID: 'bg-success-tint text-success',
  NO_EXPIRY: 'bg-neutral-tint text-neutral',
};

export const LICENSE_EXPIRY_LABELS: Record<LicenseExpiryStatus, string> = {
  EXPIRED: 'Expired',
  EXPIRING_SOON: 'Expiring soon',
  VALID: 'Valid',
  NO_EXPIRY: 'No expiry',
};
