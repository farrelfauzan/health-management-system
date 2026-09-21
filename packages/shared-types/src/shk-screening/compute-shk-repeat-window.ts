import { SHK_REPEAT_SAMPLE_WINDOW_HOURS } from '#shk-screening/compute-shk-sample-window';
import type { ShkSampleWindow } from '#shk-screening/types';

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * A repeat sample's window (P25-T10): due the moment the result that asked for
 * it was received, overdue a day later.
 */
export function computeShkRepeatWindow(resultReceivedAt: Date): ShkSampleWindow {
  return {
    dueFrom: new Date(resultReceivedAt.getTime()),
    dueUntil: new Date(
      resultReceivedAt.getTime() + SHK_REPEAT_SAMPLE_WINDOW_HOURS * MILLISECONDS_PER_HOUR,
    ),
  };
}
