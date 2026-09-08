import { ConfigService } from '@nestjs/config';

import { LabReportRepository } from '../repository/lab-report.repository';
import { LabReportService } from './lab-report.service';
import { LabReportWorker } from './lab-report.worker';

function buildWorker(configValues: Record<string, string>) {
  const configService = { get: jest.fn((key: string) => configValues[key]) };
  const mockRepository = {
    claimDueReports: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
  };
  const mockService = { renderClaimedReport: jest.fn().mockResolvedValue(undefined) };
  const worker = new LabReportWorker(
    configService as unknown as ConfigService,
    mockRepository as unknown as LabReportRepository,
    mockService as unknown as LabReportService,
  );
  return { worker, mockRepository, mockService };
}

describe('LabReportWorker', () => {
  it('claims one batch under the configured lease and renders each row in turn', async () => {
    const { worker, mockRepository, mockService } = buildWorker({
      LAB_REPORT_WORKER_BATCH_SIZE: '2',
      LAB_REPORT_LEASE_MS: '5000',
    });

    const actual = await worker.pollOnce();

    expect(actual).toBe(2);
    expect(mockRepository.claimDueReports).toHaveBeenCalledWith({
      limit: 2,
      leaseMs: 5000,
      leasedBy: expect.stringMatching(/^.+:\d+$/),
    });
    expect(mockService.renderClaimedReport).toHaveBeenCalledTimes(2);
  });

  it('skips a sweep that overlaps a running one', async () => {
    const { worker, mockService } = buildWorker({});
    let release: () => void = () => undefined;
    mockService.renderClaimedReport.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = worker.pollOnce();
    const second = await worker.pollOnce();
    release();
    const firstResult = await first;

    expect(second).toBe(0);
    expect(firstResult).toBe(2);
  });

  it('survives a claim that throws and reports nothing processed', async () => {
    const { worker, mockRepository } = buildWorker({});
    mockRepository.claimDueReports.mockRejectedValueOnce(new Error('connection reset'));

    await expect(worker.pollOnce()).resolves.toBe(0);
  });

  it('stays idle when disabled by configuration', () => {
    const { worker } = buildWorker({ LAB_REPORT_WORKER_ENABLED: 'false' });

    worker.onApplicationBootstrap();
    worker.onApplicationShutdown();

    expect(worker).toBeDefined();
  });
});
