import { SatusehatCircuitBreaker } from './satusehat-circuit-breaker';

describe('SatusehatCircuitBreaker', () => {
  let currentEpochMs: number;

  function buildBreaker(failureThreshold = 3, openDurationMs = 1_000): SatusehatCircuitBreaker {
    return new SatusehatCircuitBreaker({
      failureThreshold,
      openDurationMs,
      now: () => currentEpochMs,
    });
  }

  beforeEach(() => {
    currentEpochMs = 1_000_000;
  });

  it('stays closed while failures remain below the threshold', () => {
    const breaker = buildBreaker();

    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(true);
  });

  it('opens once consecutive failures reach the threshold', () => {
    const breaker = buildBreaker();

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(false);
  });

  it('resets the failure count on success', () => {
    const breaker = buildBreaker();

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(true);
  });

  it('allows exactly one half-open probe after the open duration elapses', () => {
    const breaker = buildBreaker(1, 1_000);

    breaker.recordFailure();
    expect(breaker.canExecute()).toBe(false);
    currentEpochMs += 1_000;

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(false);
  });

  it('closes again when the half-open probe succeeds', () => {
    const breaker = buildBreaker(1, 1_000);

    breaker.recordFailure();
    currentEpochMs += 1_000;
    expect(breaker.canExecute()).toBe(true);
    breaker.recordSuccess();

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(true);
  });

  it('re-opens for a full duration when the half-open probe fails', () => {
    const breaker = buildBreaker(1, 1_000);

    breaker.recordFailure();
    currentEpochMs += 1_000;
    expect(breaker.canExecute()).toBe(true);
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(false);
    currentEpochMs += 999;
    expect(breaker.canExecute()).toBe(false);
    currentEpochMs += 1;
    expect(breaker.canExecute()).toBe(true);
  });
});
