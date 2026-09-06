/**
 * How approval notification and the deadline sweep are configured
 * (`P16-T30`, FR-E5-25…28).
 *
 * `dueSoonWindowMs` is the only knob with a product decision behind it: it
 * is how far ahead of `dueAt` the reminder fires, and it exists because a
 * clinic that sets Friday deadlines wants Thursday's nudge, not Friday
 * morning's. Nothing here can decide a round — the sweep writes
 * notifications and stamps, and that is the whole of a deadline's effect
 * (FR-E5-28).
 */
export type DocumentApprovalConfig = {
  /** Where an approval mail's deep link points. Same origin as invitations. */
  webAppBaseUrl: string;
  isSweepEnabled: boolean;
  sweepIntervalMs: number;
  dueSoonWindowMs: number;
  /** Rounds handled per sweep, so a backlog cannot make one tick unbounded. */
  sweepBatchSize: number;
};
