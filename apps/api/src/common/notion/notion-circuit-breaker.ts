import { NotionCircuitBreakerOptions, NotionCircuitBreakerState } from './notion.types';

/**
 * Circuit breaker over the single Notion upstream. Consecutive transport
 * failures open it; after the open duration one half-open probe is allowed
 * through, and its outcome either closes or re-opens it. Rejections that prove
 * Notion is reachable — a 400, a 401, a 404 — must be recorded as successes by
 * the caller, since reachability is all this class measures.
 *
 * Same shape as {@link SatusehatCircuitBreaker}, plus {@link getState}: the
 * Notion status card (P23-T04) shows the breaker to an operator, so the state
 * has to be readable from outside.
 */
export class NotionCircuitBreaker {
  private state: NotionCircuitBreakerState = 'CLOSED';
  private consecutiveFailureCount = 0;
  private openedAtEpochMs = 0;
  private hasHalfOpenProbeInFlight = false;
  private readonly resolveNow: () => number;

  constructor(private readonly options: NotionCircuitBreakerOptions) {
    this.resolveNow = options.now ?? Date.now;
  }

  /** Returns whether a request may be attempted right now. */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }
    if (
      this.state === 'OPEN' &&
      this.resolveNow() - this.openedAtEpochMs >= this.options.openDurationMs
    ) {
      this.state = 'HALF_OPEN';
      this.hasHalfOpenProbeInFlight = false;
    }
    if (this.state === 'HALF_OPEN' && !this.hasHalfOpenProbeInFlight) {
      this.hasHalfOpenProbeInFlight = true;
      return true;
    }
    return false;
  }

  /**
   * The breaker's state as an operator would read it. Reports `HALF_OPEN`
   * once the open period has elapsed, even though nothing has probed yet —
   * otherwise a status card shows `OPEN` for a circuit that would let the next
   * request straight through.
   */
  getState(): NotionCircuitBreakerState {
    if (
      this.state === 'OPEN' &&
      this.resolveNow() - this.openedAtEpochMs >= this.options.openDurationMs
    ) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  /** Records a reachable upstream: closes the circuit and resets the count. */
  recordSuccess(): void {
    this.state = 'CLOSED';
    this.consecutiveFailureCount = 0;
    this.hasHalfOpenProbeInFlight = false;
  }

  /** Records a transport failure: counts toward opening, or re-opens a half-open circuit. */
  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionToOpen();
      return;
    }
    this.consecutiveFailureCount += 1;
    if (this.consecutiveFailureCount >= this.options.failureThreshold) {
      this.transitionToOpen();
    }
  }

  private transitionToOpen(): void {
    this.state = 'OPEN';
    this.openedAtEpochMs = this.resolveNow();
    this.consecutiveFailureCount = 0;
    this.hasHalfOpenProbeInFlight = false;
  }
}
