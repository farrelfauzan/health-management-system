import type { LabReferenceRangeView } from '@hms/shared-types';

/**
 * Renders one reference range the way a clinician reads it, and returns null
 * when the range says nothing.
 *
 * Null rather than a dash: the caller shows "tidak ada rentang rujukan" for a
 * test with no usable range, which is the honest answer — a paediatric result
 * measured against an adult band would be worse than an unflagged one.
 */
export function formatReferenceRange(range: LabReferenceRangeView): string | null {
  if (range.textNormal) {
    return range.textNormal;
  }
  if (range.low !== undefined && range.high !== undefined) {
    return `${range.low} – ${range.high}`;
  }
  if (range.low !== undefined) {
    return `≥ ${range.low}`;
  }
  if (range.high !== undefined) {
    return `≤ ${range.high}`;
  }
  return null;
}
