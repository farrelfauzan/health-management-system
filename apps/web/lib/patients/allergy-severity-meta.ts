import type { AllergySeverityValue } from '@hms/shared-types';

/** Most dangerous first — the order the allergies card renders in. */
export const ALLERGY_SEVERITY_ORDER: readonly AllergySeverityValue[] = [
  'SEVERE',
  'MODERATE',
  'MILD',
] as const;

export const ALLERGY_SEVERITY_CLASSES: Record<AllergySeverityValue, string> = {
  SEVERE: 'bg-danger-tint text-danger',
  MODERATE: 'bg-warning-tint text-warning',
  MILD: 'bg-neutral-tint text-neutral',
};
