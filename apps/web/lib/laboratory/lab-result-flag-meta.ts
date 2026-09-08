import type { LabResultFlagValue } from '@hms/shared-types';

/**
 * How a flag reads on screen: a one- or two-character chip, and the tone it
 * carries (P18-T04, P18-T07).
 *
 * `H` and `L` are what a doctor reads on every printed report in Indonesia, so
 * the chip says that rather than spelling the word — the tone does the rest.
 * The critical pair is the exception: it says "kritis" in full, because a value
 * that has to be acted on now must not be one glyph away from a value that
 * merely leans high.
 */
export type LabResultFlagMeta = {
  /** i18n key under `clinical.encounters.laboratory.flag`. */
  labelKey: LabResultFlagValue;
  short: string;
  tone: 'normal' | 'warning' | 'critical';
};

export const LAB_RESULT_FLAG_META: Readonly<Record<LabResultFlagValue, LabResultFlagMeta>> = {
  NORMAL: { labelKey: 'NORMAL', short: 'N', tone: 'normal' },
  LOW: { labelKey: 'LOW', short: 'L', tone: 'warning' },
  HIGH: { labelKey: 'HIGH', short: 'H', tone: 'warning' },
  CRITICAL_LOW: { labelKey: 'CRITICAL_LOW', short: 'L!', tone: 'critical' },
  CRITICAL_HIGH: { labelKey: 'CRITICAL_HIGH', short: 'H!', tone: 'critical' },
  ABNORMAL: { labelKey: 'ABNORMAL', short: 'A', tone: 'warning' },
};

/** True for the two flags that mean somebody has to act now. */
export function isCriticalLabFlag(flag: LabResultFlagValue | undefined): boolean {
  return flag === 'CRITICAL_LOW' || flag === 'CRITICAL_HIGH';
}
