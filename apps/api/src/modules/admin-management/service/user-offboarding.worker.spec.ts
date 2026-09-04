import { ConfigService } from '@nestjs/config';

import { UserOffboardingService } from './user-offboarding.service';
import { UserOffboardingWorker } from './user-offboarding.worker';

describe('UserOffboardingWorker', () => {
  const userOffboardingServiceMock = { sweepOnce: jest.fn() };

  function buildWorker(overrides: Record<string, string> = {}): UserOffboardingWorker {
    return new UserOffboardingWorker(
      userOffboardingServiceMock as unknown as UserOffboardingService,
      new ConfigService({ OFFBOARDING_SWEEP_INTERVAL_MS: '1000', ...overrides }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the service sweep on the configured interval', async () => {
    userOffboardingServiceMock.sweepOnce.mockResolvedValue(0);
    const worker = buildWorker();

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(2_000);
    worker.onApplicationShutdown();

    expect(userOffboardingServiceMock.sweepOnce).toHaveBeenCalledTimes(2);
  });

  it('skips an overlapping sweep rather than queueing it', async () => {
    let releaseSweep: () => void = () => undefined;
    userOffboardingServiceMock.sweepOnce.mockImplementation(
      () =>
        new Promise<number>((resolveSweep) => {
          releaseSweep = () => resolveSweep(1);
        }),
    );
    const worker = buildWorker();

    const first = worker.sweepOnce();
    const second = await worker.sweepOnce();
    releaseSweep();

    expect(second).toBe(0);
    expect(await first).toBe(1);
    expect(userOffboardingServiceMock.sweepOnce).toHaveBeenCalledTimes(1);
  });

  it('turns a failed sweep into a logged zero, not a crashed interval', async () => {
    userOffboardingServiceMock.sweepOnce.mockRejectedValue(new Error('database away'));

    await expect(buildWorker().sweepOnce()).resolves.toBe(0);
  });

  it('does not start when disabled', async () => {
    const worker = buildWorker({ OFFBOARDING_SWEEP_ENABLED: 'false' });

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(userOffboardingServiceMock.sweepOnce).not.toHaveBeenCalled();
  });

  it('refuses a non-positive interval at construction', () => {
    expect(() => buildWorker({ OFFBOARDING_SWEEP_INTERVAL_MS: '0' })).toThrow(
      /OFFBOARDING_SWEEP_INTERVAL_MS/,
    );
  });
});
