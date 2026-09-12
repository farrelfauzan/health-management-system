import { NotionRateLimiter } from './notion-rate-limiter';

describe('NotionRateLimiter', () => {
  let currentEpochMs = 0;
  let recordedWaitsMs: number[] = [];

  function buildLimiter(maxRequestsPerSecond: number): NotionRateLimiter {
    currentEpochMs = 0;
    recordedWaitsMs = [];
    return new NotionRateLimiter(
      maxRequestsPerSecond,
      () => currentEpochMs,
      async (durationMs: number): Promise<void> => {
        recordedWaitsMs.push(durationMs);
        currentEpochMs += durationMs;
      },
    );
  }

  it('lets the first call through without waiting', async () => {
    const limiter = buildLimiter(3);
    await limiter.acquire();
    expect(recordedWaitsMs).toEqual([]);
  });

  it('spaces consecutive calls at the configured rate', async () => {
    const limiter = buildLimiter(3);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(recordedWaitsMs).toEqual([334, 334]);
  });

  it('does not delay a call that arrives after the interval has passed', async () => {
    const limiter = buildLimiter(2);
    await limiter.acquire();
    currentEpochMs += 5_000;
    await limiter.acquire();
    expect(recordedWaitsMs).toEqual([]);
  });

  it('reserves a slot for every concurrent caller', async () => {
    const limiter = buildLimiter(1);
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(recordedWaitsMs).toHaveLength(2);
  });

  it('pushes the next slot back after Notion asks us to wait', async () => {
    const limiter = buildLimiter(3);
    limiter.pauseFor(2_000);
    await limiter.acquire();
    expect(recordedWaitsMs).toEqual([2_000]);
  });
});
