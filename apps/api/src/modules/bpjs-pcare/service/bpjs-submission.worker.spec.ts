import { BpjsSubmissionWorker } from './bpjs-submission.worker';

describe('BpjsSubmissionWorker', () => {
  const submissionRepositoryMock = { claimDueSubmissions: jest.fn() };
  const submissionServiceMock = { processSubmission: jest.fn() };

  function createWorker(env: Record<string, string | undefined> = {}): BpjsSubmissionWorker {
    const configServiceMock = { get: jest.fn((key: string) => env[key]) };
    return new BpjsSubmissionWorker(
      submissionRepositoryMock as never,
      submissionServiceMock as never,
      configServiceMock as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue([]);
    submissionServiceMock.processSubmission.mockResolvedValue(undefined);
  });

  it('does not start polling when the worker flag is off', () => {
    jest.useFakeTimers();
    const worker = createWorker({ BPJS_WORKER_ENABLED: 'false' });

    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(60_000);

    expect(submissionRepositoryMock.claimDueSubmissions).not.toHaveBeenCalled();
    worker.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('processes each due submission in order', async () => {
    const inputSubmissions = [{ id: 'submission-1' }, { id: 'submission-2' }];
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue(inputSubmissions);
    const worker = createWorker();

    const actualCount = await worker.pollOnce();

    expect(actualCount).toBe(2);
    expect(submissionServiceMock.processSubmission).toHaveBeenNthCalledWith(
      1,
      inputSubmissions[0],
    );
    expect(submissionServiceMock.processSubmission).toHaveBeenNthCalledWith(
      2,
      inputSubmissions[1],
    );
  });

  it('claims rows under the configured lease rather than merely reading them', async () => {
    const worker = createWorker({ BPJS_SUBMISSION_LEASE_MS: '300000' });

    await worker.pollOnce();

    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledWith({
      limit: 5,
      leaseMs: 300_000,
    });
  });

  it('skips an overlapping poll cycle instead of queueing it', async () => {
    let releaseFirstCycle: () => void = () => undefined;
    submissionRepositoryMock.claimDueSubmissions.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirstCycle = () => resolve([]);
        }),
    );
    const worker = createWorker();

    const firstCycle = worker.pollOnce();
    const overlappingCount = await worker.pollOnce();
    releaseFirstCycle();
    await firstCycle;

    expect(overlappingCount).toBe(0);
    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledTimes(1);
  });

  it('survives a throwing due-row query', async () => {
    submissionRepositoryMock.claimDueSubmissions.mockRejectedValue(new Error('database gone'));
    const worker = createWorker();

    await expect(worker.pollOnce()).resolves.toBe(0);
  });

  it('starts and stops the polling interval with the application', async () => {
    jest.useFakeTimers();
    const worker = createWorker({ BPJS_WORKER_POLL_INTERVAL_MS: '1000' });

    worker.onApplicationBootstrap();
    for (let tick = 0; tick < 3; tick += 1) {
      jest.advanceTimersByTime(1_000);
      await jest.advanceTimersByTimeAsync(0);
    }
    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledTimes(3);

    worker.onApplicationShutdown();
    jest.advanceTimersByTime(3_000);
    await jest.advanceTimersByTimeAsync(0);
    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
});
