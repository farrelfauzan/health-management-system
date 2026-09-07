import {
  LabResultFlagValue,
  LabResultRangeSnapshot,
  LabResultTypeValue,
} from '@hms/shared-types';

/** The value being judged, and the band it is judged against. */
export type ComputeLabFlagParams = {
  resultType: LabResultTypeValue;
  valueNumeric: number | null;
  valueText: string | null;
  valueCoded: string | null;
  /** The band snapshotted at entry, or null when none applied to this patient. */
  range: LabResultRangeSnapshot | null;
};

/**
 * Whether a measured value is abnormal, and how far (P18-T04).
 *
 * A pure function on purpose, and the most heavily tested thing in this
 * module: it is the one place where a bug becomes a clinical error rather than
 * a rendering one. It reads nothing, writes nothing, and never re-reads the
 * catalog — the band it compares against is the snapshot taken when the value
 * was measured, which is what keeps a range edited in 2027 from re-flagging a
 * 2026 result.
 *
 * The comparisons are deliberately asymmetric: the normal band is **inclusive**
 * (a value exactly on `low` is normal — a range published as 12–16 means twelve
 * is fine), while the critical thresholds are **strict** (a value exactly on
 * `criticalLow` is LOW, not CRITICAL_LOW). Telephoning a clinician is reserved
 * for values that are past the threshold, not on it.
 *
 * Returns `null` — never a default — when there is nothing to judge against.
 * A missing band means the result is recorded and displayed unjudged; it must
 * never mean "normal", and it must never fall back to a band meant for
 * somebody of a different age or sex.
 */
export function computeLabFlag(params: ComputeLabFlagParams): LabResultFlagValue | null {
  const { range } = params;
  if (range === null) {
    return null;
  }
  if (params.resultType === 'NUMERIC') {
    return computeNumericFlag(params.valueNumeric, range);
  }

  return computeTextualFlag(params.valueText ?? params.valueCoded, range.refText);
}

function computeNumericFlag(
  value: number | null,
  range: LabResultRangeSnapshot,
): LabResultFlagValue | null {
  const hasBound =
    range.refLow !== null ||
    range.refHigh !== null ||
    range.refCriticalLow !== null ||
    range.refCriticalHigh !== null;
  if (value === null || !hasBound) {
    return null;
  }
  if (range.refCriticalLow !== null && value < range.refCriticalLow) {
    return 'CRITICAL_LOW';
  }
  if (range.refCriticalHigh !== null && value > range.refCriticalHigh) {
    return 'CRITICAL_HIGH';
  }
  if (range.refLow !== null && value < range.refLow) {
    return 'LOW';
  }
  if (range.refHigh !== null && value > range.refHigh) {
    return 'HIGH';
  }

  return 'NORMAL';
}

/**
 * TEXT and CODED results compare against the one normal value the band names.
 * "Abnormal" is all a non-numeric result can say — there is no direction to a
 * positive dengue NS1 — so the pair is NORMAL/ABNORMAL and never LOW/HIGH.
 * Comparison is trimmed and case-insensitive because "Negatif" and "negatif"
 * are the same answer typed by two different people.
 */
function computeTextualFlag(
  value: string | null,
  textNormal: string | null,
): LabResultFlagValue | null {
  if (value === null || textNormal === null) {
    return null;
  }

  return value.trim().toLowerCase() === textNormal.trim().toLowerCase() ? 'NORMAL' : 'ABNORMAL';
}
