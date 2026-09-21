import type { ShkSampleWindow } from '#shk-screening/types';

/** The heel prick is taken no earlier than 48 hours after birth. */
export const SHK_SAMPLE_WINDOW_START_HOURS = 48;

/** …and no later than 72 hours after it. */
export const SHK_SAMPLE_WINDOW_END_HOURS = 72;

/**
 * How long a repeat sample (after RECALL or INVALID_SAMPLE) stays DUE before it
 * reads OVERDUE. The repeat is due at once; a day is the product default.
 */
export const SHK_REPEAT_SAMPLE_WINDOW_HOURS = 24;

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * The first sample's window, as absolute offsets from the birth instant
 * (P25-T10). Absolute rather than calendar arithmetic on purpose: "48 hours"
 * is a physiological interval, so a baby born 1 Oct 03:00 WIB is due from
 * 3 Oct 03:00 until 4 Oct 03:00 WIB whatever the clinic's timezone.
 */
export function computeShkSampleWindow(birthAt: Date): ShkSampleWindow {
  return {
    dueFrom: new Date(birthAt.getTime() + SHK_SAMPLE_WINDOW_START_HOURS * MILLISECONDS_PER_HOUR),
    dueUntil: new Date(birthAt.getTime() + SHK_SAMPLE_WINDOW_END_HOURS * MILLISECONDS_PER_HOUR),
  };
}
