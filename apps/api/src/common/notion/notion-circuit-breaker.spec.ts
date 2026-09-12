import { NotionCircuitBreaker } from './notion-circuit-breaker';

describe('NotionCircuitBreaker', () => {
  let currentEpochMs = 0;

  function buildBreaker(): NotionCircuitBreaker {
    currentEpochMs = 1_000;
    return new NotionCircuitBreaker({
      failureThreshold: 3,
      openDurationMs: 30_000,
      now: () => currentEpochMs,
    });
  }

  it('stays closed below the failure threshold', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canExecute()).toBe(true);
  });

  it('opens at the threshold and sheds load', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canExecute()).toBe(false);
  });

  it('reports half-open once the open duration has elapsed, before any probe', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    currentEpochMs += 30_000;
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('lets exactly one probe through when half-open', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    currentEpochMs += 30_000;
    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(false);
  });

  it('re-opens when the half-open probe fails', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    currentEpochMs += 30_000;
    breaker.canExecute();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
  });

  it('closes when the half-open probe succeeds', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    currentEpochMs += 30_000;
    breaker.canExecute();
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.canExecute()).toBe(true);
  });

  it('resets the failure count on a success', () => {
    const breaker = buildBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');
  });
});
