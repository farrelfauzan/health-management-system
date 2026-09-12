import { NotionHttpClient } from '../../../common/notion/notion-http.client';
import { BugReportPublishConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { BugReportPublishService } from './bug-report-publish.service';
import { BugReportPublishWorker } from './bug-report-publish.worker';

function buildConfig(overrides: Partial<BugReportPublishConfig> = {}): BugReportPublishConfig {
  return {
    clinicLabel: 'Klinik Sehat',
    workerEnabled: true,
    workerPollIntervalMs: 20_000,
    workerBatchSize: 2,
    leaseMs: 120_000,
    maxAttempts: 3,
    retryBaseDelayMs: 1_000,
    publishedTextRetentionDays: 30,
    heldTextRetentionDays: 7,
    ...overrides,
  };
}

describe('BugReportPublishWorker', () => {
  const claimDueReportsMock = jest.fn();
  const findForPublishMock = jest.fn();
  const purgeExpiredContentMock = jest.fn();
  const processReportMock = jest.fn();
  const isConfiguredMock = jest.fn();

  function buildWorker(config: BugReportPublishConfig = buildConfig()): BugReportPublishWorker {
    return new BugReportPublishWorker(
      config,
      {
        claimDueReports: claimDueReportsMock,
        findForPublish: findForPublishMock,
        purgeExpiredContent: purgeExpiredContentMock,
      } as unknown as BugReportRepository,
      { processReport: processReportMock } as unknown as BugReportPublishService,
      { isConfigured: isConfiguredMock } as unknown as NotionHttpClient,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    isConfiguredMock.mockReturnValue(true);
    purgeExpiredContentMock.mockResolvedValue(0);
  });

  it('claims TRIAGED rows and publishes each one', async () => {
    claimDueReportsMock.mockResolvedValueOnce(['1']);
    findForPublishMock.mockResolvedValueOnce([{ id: '1' }]);

    const actualCount = await buildWorker().pollOnce();

    expect(claimDueReportsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'TRIAGED', limit: 2 }),
    );
    expect(processReportMock).toHaveBeenCalledTimes(1);
    expect(actualCount).toBe(1);
  });

  /**
   * The ticket's explicit requirement, and the reason it matters: claiming a row
   * and then finding there is nowhere to send it would count an attempt, so a
   * deployment waiting on its Notion credentials would find its whole backlog in
   * FAILED by the time they arrived.
   */
  it('claims nothing at all when the connector is not configured', async () => {
    isConfiguredMock.mockReturnValue(false);

    const actualCount = await buildWorker().pollOnce();

    expect(claimDueReportsMock).not.toHaveBeenCalled();
    expect(processReportMock).not.toHaveBeenCalled();
    expect(actualCount).toBe(0);
  });

  /** Retention does not depend on whether a board exists. */
  it('still purges expired text when the connector is not configured', async () => {
    isConfiguredMock.mockReturnValue(false);

    await buildWorker().pollOnce();

    expect(purgeExpiredContentMock).toHaveBeenCalledTimes(1);
  });

  it('purges at most once a day however often it sweeps', async () => {
    claimDueReportsMock.mockResolvedValue([]);
    findForPublishMock.mockResolvedValue([]);
    const worker = buildWorker();

    await worker.pollOnce();
    await worker.pollOnce();
    await worker.pollOnce();

    expect(purgeExpiredContentMock).toHaveBeenCalledTimes(1);
  });

  it('purges against the two cutoffs §5c sets', async () => {
    claimDueReportsMock.mockResolvedValueOnce([]);
    findForPublishMock.mockResolvedValueOnce([]);

    await buildWorker().pollOnce();

    // Asserted before destructuring: `?.[0]` short-circuiting to `undefined`
    // would make the destructure itself throw, and the failure would read as a
    // TypeError rather than as "the purge never ran".
    expect(purgeExpiredContentMock).toHaveBeenCalledTimes(1);
    const [cutoffs] = purgeExpiredContentMock.mock.calls[0];
    const daysAgo = (value: Date): number =>
      Math.round((Date.now() - value.getTime()) / 86_400_000);
    expect(daysAgo(cutoffs.publishedBefore)).toBe(30);
    expect(daysAgo(cutoffs.heldBefore)).toBe(7);
  });

  it('skips an overlapping sweep rather than queueing it', async () => {
    let releaseFirstSweep: () => void = () => undefined;
    claimDueReportsMock.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        releaseFirstSweep = () => resolve([]);
      }),
    );
    findForPublishMock.mockResolvedValue([]);
    const worker = buildWorker();

    const firstSweep = worker.pollOnce();
    const secondSweep = await worker.pollOnce();
    releaseFirstSweep();
    await firstSweep;

    expect(secondSweep).toBe(0);
    expect(claimDueReportsMock).toHaveBeenCalledTimes(1);
  });

  it('starts no timer when the worker is switched off', () => {
    const worker = buildWorker(buildConfig({ workerEnabled: false }));

    worker.onApplicationBootstrap();
    worker.onApplicationShutdown();

    expect(claimDueReportsMock).not.toHaveBeenCalled();
  });
});
