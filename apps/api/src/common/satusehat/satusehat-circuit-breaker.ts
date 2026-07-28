import { SatusehatCircuitBreakerOptions, SatusehatCircuitBreakerState } from './satusehat.types';

/**
 * Minimal circuit breaker for the single SATUSEHAT upstream. Consecutive
 * transport failures open the circuit; after the open duration one half-open
 * probe is allowed through, and its outcome either closes or re-opens the
 * circuit. Business-level rejections (4xx) must be recorded as successes by
 * the caller — they prove the upstream is reachable, which is all this class
 * measures.
 */
export class SatusehatCircuitBreaker {
  private state: SatusehatCircuitBreakerState = 'CLOSED';
  private consecutiveFailureCount = 0;
  private openedAtEpochMs = 0;
  private hasHalfOpenProbeInFlight = false;
  private readonly resolveNow: () => number;

  constructor(private readonly options: SatusehatCircuitBreakerOptions) {
    this.resolveNow = options.now ?? Date.now;
  }

  /** Returns whether a request may be attempted right now. */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }
    if (this.state === 'OPEN' && this.resolveNow() - this.openedAtEpochMs >= this.options.openDurationMs) {
      this.state = 'HALF_OPEN';
      this.hasHalfOpenProbeInFlight = false;
    }
    if (this.state === 'HALF_OPEN' && !this.hasHalfOpenProbeInFlight) {
      this.hasHalfOpenProbeInFlight = true;
      return true;
    }
    return false;
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
