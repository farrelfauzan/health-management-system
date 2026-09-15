import type { DoctorAuthorityStatusValue } from '@hms/shared-types';

/**
 * Chip tones for a midwife authority's status (P25-T02), on the same tokens
 * as the licence chips so the two cards read as one page.
 */
export const DOCTOR_AUTHORITY_STATUS_CLASSES: Readonly<Record<DoctorAuthorityStatusValue, string>> =
  {
    ACTIVE: 'bg-success-tint text-success',
    EXPIRING_SOON: 'bg-warning-tint text-warning',
    EXPIRED: 'bg-danger-tint text-danger',
    REVOKED: 'bg-neutral-tint text-neutral',
  };
