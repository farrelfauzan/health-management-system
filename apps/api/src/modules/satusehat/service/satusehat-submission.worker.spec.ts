import { ConfigService } from '@nestjs/config';

import { SatusehatSubmissionRepository } from '../repository/satusehat-submission.repository';
import { SatusehatSubmissionService } from './satusehat-submission.service';
import { SatusehatSubmissionWorker } from './satusehat-submission.worker';

function buildConfigService(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const CONFIGURED_VALUES: Record<string, string> = {
  SATUSEHAT_ORGANIZATION_ID: '10000004',
  SATUSEHAT_CLIENT_ID: 'client-id',
  SATUSEHAT_CLIENT_SECRET: 'client-secret',
  SATUSEHAT_WORKER_POLL_INTERVAL_MS: '15000',
};

describe('SatusehatSubmissionWorker', () => {
  const submissionServiceMock = {
    processSubmission: jest.fn(),
  };
  const submissionRepositoryMock = {
    claimDueSubmissions: jest.fn(),
  };

  function buildWorker(values: Record<string, string>): SatusehatSubmissionWorker {
    return new SatusehatSubmissionWorker(
      buildConfigService(values),
      submissionServiceMock as unknown as SatusehatSubmissionService,
      submissionRepositoryMock as unknown as SatusehatSubmissionRepository,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start polling when the adapter is unconfigured', () => {
    const worker = buildWorker({});

    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(60_000);

    expect(submissionRepositoryMock.claimDueSubmissions).not.toHaveBeenCalled();
    worker.onApplicationShutdown();
  });

  it('does not start polling when the worker flag is off', () => {
    const worker = buildWorker({ ...CONFIGURED_VALUES, SATUSEHAT_WORKER_ENABLED: 'false' });

    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(60_000);

    expect(submissionRepositoryMock.claimDueSubmissions).not.toHaveBeenCalled();
    worker.onApplicationShutdown();
  });

  it('processes each due submission in order during a poll cycle', async () => {
    const firstSubmission = { id: 'submission-1' };
    const secondSubmission = { id: 'submission-2' };
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue([
      firstSubmission,
      secondSubmission,
    ]);
    submissionServiceMock.processSubmission.mockResolvedValue(undefined);
    const worker = buildWorker(CONFIGURED_VALUES);

    const actualProcessedCount = await worker.pollOnce();

    expect(actualProcessedCount).toBe(2);
    expect(submissionServiceMock.processSubmission).toHaveBeenNthCalledWith(1, firstSubmission);
    expect(submissionServiceMock.processSubmission).toHaveBeenNthCalledWith(2, secondSubmission);
  });

  it('claims rows under the configured lease rather than merely reading them', async () => {
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue([]);
    const worker = buildWorker({ ...CONFIGURED_VALUES, SATUSEHAT_SUBMISSION_LEASE_MS: '300000' });

    await worker.pollOnce();

    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledWith({
      limit: 5,
      leaseMs: 300_000,
    });
  });

  it('skips a poll cycle that would overlap a running one', async () => {
    let releasePoll: () => void = () => undefined;
    submissionRepositoryMock.claimDueSubmissions.mockReturnValue(
      new Promise((resolve) => {
        releasePoll = () => resolve([]);
      }),
    );
    const worker = buildWorker(CONFIGURED_VALUES);

    const firstCycle = worker.pollOnce();
    const overlappingCount = await worker.pollOnce();
    releasePoll();
    await firstCycle;

    expect(overlappingCount).toBe(0);
    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledTimes(1);
  });

  it('survives a poll cycle whose query throws', async () => {
    submissionRepositoryMock.claimDueSubmissions.mockRejectedValue(new Error('connection reset'));
    const worker = buildWorker(CONFIGURED_VALUES);

    const actualProcessedCount = await worker.pollOnce();

    expect(actualProcessedCount).toBe(0);
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue([]);
    await expect(worker.pollOnce()).resolves.toBe(0);
  });

  it('starts and stops the interval when configured', async () => {
    submissionRepositoryMock.claimDueSubmissions.mockResolvedValue([]);
    const worker = buildWorker(CONFIGURED_VALUES);

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(15_000);
    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledTimes(1);

    worker.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(submissionRepositoryMock.claimDueSubmissions).toHaveBeenCalledTimes(1);
  });
});
