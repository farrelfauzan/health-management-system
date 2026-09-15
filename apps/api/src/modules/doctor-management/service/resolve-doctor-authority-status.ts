import {
  DOCTOR_AUTHORITY_EXPIRING_SOON_DAYS,
  DoctorAuthorityRecord,
  DoctorAuthorityStatusValue,
} from '@hms/shared-types';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The status chip for one authority, judged against the clinic's calendar
 * day (P25-T02). Revoked wins over everything; a lapsed end date reads as
 * expired; inside 60 days of it reads as expiring soon; otherwise active. A
 * grant whose `validFrom` is still ahead is reported active here — the
 * enforcement question (P25-T03) asks `hasActiveAuthority` instead.
 */
export function resolveDoctorAuthorityStatus(
  record: Pick<DoctorAuthorityRecord, 'revokedAt' | 'validUntil'>,
  today: Date,
): DoctorAuthorityStatusValue {
  if (record.revokedAt !== null) {
    return 'REVOKED';
  }
  if (record.validUntil === null) {
    return 'ACTIVE';
  }
  const daysUntilExpiry = Math.round(
    (record.validUntil.getTime() - today.getTime()) / MILLISECONDS_PER_DAY,
  );
  if (daysUntilExpiry < 0) {
    return 'EXPIRED';
  }
  if (daysUntilExpiry <= DOCTOR_AUTHORITY_EXPIRING_SOON_DAYS) {
    return 'EXPIRING_SOON';
  }
  return 'ACTIVE';
}
