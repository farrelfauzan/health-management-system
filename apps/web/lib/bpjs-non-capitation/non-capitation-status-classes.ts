import type { NonCapitationClaimStatusValue } from '@hms/shared-types';

/** One colour per claim status, in the postnatal schedule's palette (P25-T16). */
export const NON_CAPITATION_STATUS_CLASSES: Readonly<
  Record<NonCapitationClaimStatusValue, string>
> = {
  OPEN: 'bg-slate-100 text-slate-600',
  DUE_SOON: 'bg-warning-tint text-warning',
  LATE: 'bg-danger-tint text-danger',
  EXPIRED: 'bg-danger-tint text-danger',
  SENT: 'bg-success-tint text-success',
};
