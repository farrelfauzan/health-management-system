const MILLISECONDS_PER_SECOND = 1000;

/**
 * Paces outbound Notion calls to the integration's rate limit (P23-T03).
 *
 * Notion allows an integration roughly three requests per second and answers
 * `429` above it. Spacing the calls costs a bug report a few hundred
 * milliseconds it does not notice, and spares the publisher a retry storm on
 * the one path where a retry is dangerous — page creation is not idempotent.
 *
 * Per process, not per cluster: each deployment is one clinic with one
 * integration, so the process boundary and the rate-limit boundary are the
 * same. A reservation is taken synchronously before any `await`, so two
 * concurrent callers cannot claim the same slot.
 */
export class NotionRateLimiter {
  private readonly minimumIntervalMs: number;
  private nextSlotAtEpochMs = 0;

  constructor(
    maxRequestsPerSecond: number,
    private readonly resolveNow: () => number = Date.now,
    private readonly delay: (durationMs: number) => Promise<void> = (durationMs) =>
      new Promise((resolve) => setTimeout(resolve, durationMs)),
  ) {
    this.minimumIntervalMs = Math.ceil(MILLISECONDS_PER_SECOND / maxRequestsPerSecond);
  }

  /** Resolves when the caller may send its request. */
  async acquire(): Promise<void> {
    const nowEpochMs = this.resolveNow();
    const slotAtEpochMs = Math.max(nowEpochMs, this.nextSlotAtEpochMs);
    this.nextSlotAtEpochMs = slotAtEpochMs + this.minimumIntervalMs;
    const waitMs = slotAtEpochMs - nowEpochMs;
    if (waitMs > 0) {
      await this.delay(waitMs);
    }
  }

  /**
   * Pushes every pending slot back by at least this long, after Notion has
   * said `Retry-After`. Without it the retry and the calls queued behind it
   * race straight back into the limit.
   */
  pauseFor(durationMs: number): void {
    this.nextSlotAtEpochMs = Math.max(this.nextSlotAtEpochMs, this.resolveNow() + durationMs);
  }
}
