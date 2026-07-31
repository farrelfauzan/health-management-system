import { AiProviderCircuitBreaker } from './ai-provider-circuit-breaker';

describe('AiProviderCircuitBreaker', () => {
  function buildBreaker(nowRef: { epochMs: number }): AiProviderCircuitBreaker {
    return new AiProviderCircuitBreaker({
      failureThreshold: 3,
      openDurationMs: 1_000,
      now: () => nowRef.epochMs,
    });
  }

  it('stays closed below the failure threshold', () => {
    const nowRef = { epochMs: 0 };
    const breaker = buildBreaker(nowRef);

    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(true);
  });

  it('opens after consecutive failures reach the threshold', () => {
    const nowRef = { epochMs: 0 };
    const breaker = buildBreaker(nowRef);

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(false);
  });

  it('resets the failure count on success', () => {
    const nowRef = { epochMs: 0 };
    const breaker = buildBreaker(nowRef);

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(true);
  });

  it('allows exactly one half-open probe after the open duration', () => {
    const nowRef = { epochMs: 0 };
    const breaker = buildBreaker(nowRef);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    nowRef.epochMs = 1_000;

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(false);
  });

  it('closes when the half-open probe succeeds', () => {
    const nowRef = { epochMs: 0 };
    const breaker = buildBreaker(nowRef);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    nowRef.epochMs = 1_000;
    breaker.canExecute();

    breaker.recordSuccess();

    expect(breaker.canExecute()).toBe(true);
    expect(breaker.canExecute()).toBe(true);
  });

  it('re-opens when the half-open probe fails', () => {
    const nowRef = { epochMs: 0 };
    const breaker = buildBreaker(nowRef);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    nowRef.epochMs = 1_000;
    breaker.canExecute();

    breaker.recordFailure();

    expect(breaker.canExecute()).toBe(false);
    nowRef.epochMs = 1_999;
    expect(breaker.canExecute()).toBe(false);
    nowRef.epochMs = 2_000;
    expect(breaker.canExecute()).toBe(true);
  });
});
