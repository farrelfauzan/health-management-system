import type { BloodTypeValue, RhesusFactorValue } from '@hms/shared-types';

import { formatStatusLabel } from '#lib/shared/status-label';

export const EMPTY_VALUE = '—';

/**
 * Blood type and rhesus are two columns but one clinical fact, so they render
 * as one: `O+`. Either half alone is still worth showing — a known group with
 * an unknown rhesus is common on Indonesian registration forms.
 */
export function formatBloodType(
  bloodType?: BloodTypeValue,
  rhesusFactor?: RhesusFactorValue,
): string {
  if (!bloodType && !rhesusFactor) {
    return EMPTY_VALUE;
  }

  const rhesusSymbol =
    rhesusFactor === 'POSITIVE' ? '+' : rhesusFactor === 'NEGATIVE' ? '−' : '';

  return `${bloodType ?? '?'}${rhesusSymbol}`;
}

export function formatOptionalLabel(value?: string): string {
  return value ? formatStatusLabel(value) : EMPTY_VALUE;
}

export function formatGuardian(name?: string, relation?: string): string {
  if (!name) {
    return EMPTY_VALUE;
  }

  return relation ? `${name} (${relation})` : name;
}
