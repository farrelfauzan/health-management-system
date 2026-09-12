import { BugReportTriageRecord } from '@hms/shared-types';

import { BugReportTriageConfig } from '../bug-report-triage.types';
import { BugReportRepository } from '../repository/bug-report.repository';
import { BugReportTriageService } from './bug-report-triage.service';
import { BugReportTriageWorker } from './bug-report-triage.worker';

function buildConfig(overrides: Partial<BugReportTriageConfig> = {}): BugReportTriageConfig {
  return {
    isConfigured: true,
    providerKind: 'ANTHROPIC',
    model: 'claude-test',
    apiKey: 'sk-test',
    baseUrl: null,
    timeoutMs: 30_000,
    maxTokens: 2_048,
    workerEnabled: true,
    workerPollIntervalMs: 15_000,
    workerBatchSize: 2,
    leaseMs: 120_000,
    maxAttempts: 3,
    retryBaseDelayMs: 1_000,
    staleAfterMs: 3_600_000,
    ...overrides,
  };
}

function buildReport(id: string): BugReportTriageRecord {
  return {
    id,
    reference: `BR-00000${id}`,
    reporterUserId: 'user-1',
    reporterRole: 'DOCTOR',
    title: 'Judul',
    description: 'Deskripsi',
    stepsToReproduce: null,
    expected: null,
    actual: null,
    pagePath: '/admin',
    requestIds: [],
    appVersion: null,
    attemptCount: 0,
    createdAt: new Date(),
  };
}

describe('BugReportTriageWorker', () => {
  const claimDueReportsMock = jest.fn();
  const findForTriageMock = jest.fn();
  const processReportMock = jest.fn();

  function buildWorker(config: BugReportTriageConfig = buildConfig()): BugReportTriageWorker {
    return new BugReportTriageWorker(
      config,
      {
        claimDueReports: claimDueReportsMock,
        findForTriage: findForTriageMock,
      } as unknown as BugReportRepository,
      { processReport: processReportMock } as unknown as BugReportTriageService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('claims RECEIVED rows and triages each one', async () => {
    claimDueReportsMock.mockResolvedValueOnce(['1', '2']);
    findForTriageMock.mockResolvedValueOnce([buildReport('1'), buildReport('2')]);

    const actualCount = await buildWorker().pollOnce();

    expect(claimDueReportsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'RECEIVED', limit: 2, leaseMs: 120_000 }),
    );
    expect(processReportMock).toHaveBeenCalledTimes(2);
    expect(actualCount).toBe(2);
  });

  it('does nothing when nothing is due', async () => {
    claimDueReportsMock.mockResolvedValueOnce([]);
    findForTriageMock.mockResolvedValueOnce([]);

    expect(await buildWorker().pollOnce()).toBe(0);
    expect(processReportMock).not.toHaveBeenCalled();
  });

  /**
   * A sweep that outlives its interval is a sweep talking to a slow vendor, and
   * queueing more of those would multiply load on the thing already struggling.
   * The claimed rows keep their lease; the next tick picks up where this left off.
   */
  it('skips an overlapping sweep rather than queueing it', async () => {
    let releaseFirstSweep: () => void = () => undefined;
    claimDueReportsMock.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        releaseFirstSweep = () => resolve([]);
      }),
    );
    findForTriageMock.mockResolvedValue([]);
    const worker = buildWorker();

    const firstSweep = worker.pollOnce();
    const secondSweep = await worker.pollOnce();
    releaseFirstSweep();
    await firstSweep;

    expect(secondSweep).toBe(0);
    expect(claimDueReportsMock).toHaveBeenCalledTimes(1);
  });

  /**
   * `processReport` never throws, so reaching the catch means the claim or the
   * read failed — a database problem the next tick retries. The sweep must not
   * take the process down with it.
   */
  it('survives a failed claim and reports nothing processed', async () => {
    claimDueReportsMock.mockRejectedValueOnce(new Error('connection terminated'));

    expect(await buildWorker().pollOnce()).toBe(0);
  });

  it('starts no timer when the worker is switched off', () => {
    const worker = buildWorker(buildConfig({ workerEnabled: false }));

    worker.onApplicationBootstrap();
    worker.onApplicationShutdown();

    expect(claimDueReportsMock).not.toHaveBeenCalled();
  });

  /**
   * A deployment with no triage key still runs the worker, and should: the
   * service settles each report as FALLBACK, so the board fills with tickets
   * written by the people who filed them rather than with nothing.
   */
  it('still sweeps when no triage key is configured', async () => {
    claimDueReportsMock.mockResolvedValueOnce(['1']);
    findForTriageMock.mockResolvedValueOnce([buildReport('1')]);

    const actualCount = await buildWorker(buildConfig({ isConfigured: false })).pollOnce();

    expect(actualCount).toBe(1);
    expect(processReportMock).toHaveBeenCalledTimes(1);
  });
});
