import type { DoctorLicenseExpiryBucketsView } from '@hms/shared-types';

/**
 * The doctors carrying at least one lapsed licence, keyed by id with their
 * soonest-expiring lapsed licence's date (US-E3-08).
 *
 * Derived from the expiry roster rather than from the directory payload,
 * because the directory is readable by doctors and patients and the roster is
 * not. Widening `DoctorListItem` with licence expiry would have published to
 * every patient the one fact this dashboard exists to keep among
 * administrators.
 */
export function buildExpiredLicenseIndex(
  buckets: DoctorLicenseExpiryBucketsView,
): Map<string, string> {
  const byDoctorId = new Map<string, string>();
  for (const row of buckets.expired) {
    const existing = byDoctorId.get(row.doctorId);
    if (existing === undefined || row.expiresAt < existing) {
      byDoctorId.set(row.doctorId, row.expiresAt);
    }
  }
  return byDoctorId;
}
