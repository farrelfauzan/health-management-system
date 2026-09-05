import { ConfigService } from '@nestjs/config';

import { DocumentDeliveryRepository } from '../repository/document-delivery.repository';
import { DeliverySendService } from './delivery-send.service';
import { DocumentDeliveryWorker } from './document-delivery.worker';

function buildWorker(configValues: Record<string, string>) {
  const configService = { get: jest.fn((key: string) => configValues[key]) };
  const mockRepository = {
    claimDueDeliveries: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    countSentSince: jest.fn().mockResolvedValue(0),
  };
  const mockSendService = { processDelivery: jest.fn().mockResolvedValue(undefined) };
  const worker = new DocumentDeliveryWorker(
    configService as unknown as ConfigService,
    mockRepository as unknown as DocumentDeliveryRepository,
    mockSendService as unknown as DeliverySendService,
  );
  return { worker, mockRepository, mockSendService };
}

describe('DocumentDeliveryWorker', () => {
  it('claims one batch under the configured lease and sends each row in turn', async () => {
    const { worker, mockRepository, mockSendService } = buildWorker({
      DELIVERY_WORKER_BATCH_SIZE: '2',
      DELIVERY_LEASE_MS: '5000',
    });

    const actual = await worker.pollOnce();

    expect(actual).toBe(2);
    expect(mockRepository.claimDueDeliveries).toHaveBeenCalledWith({
      limit: 2,
      leaseMs: 5000,
      leasedBy: expect.stringMatching(/^.+:\d+$/),
    });
    expect(mockSendService.processDelivery).toHaveBeenCalledTimes(2);
    expect(mockRepository.countSentSince).not.toHaveBeenCalled();
  });

  it('claims nothing once the daily cap is reached, and only the headroom below it', async () => {
    const { worker, mockRepository } = buildWorker({
      DELIVERY_WORKER_BATCH_SIZE: '3',
      DELIVERY_DAILY_SEND_CAP: '10',
    });
    mockRepository.countSentSince.mockResolvedValueOnce(10).mockResolvedValueOnce(9);

    const atCap = await worker.pollOnce();
    const nearCap = await worker.pollOnce();

    expect(atCap).toBe(0);
    expect(nearCap).toBe(2);
    expect(mockRepository.claimDueDeliveries).toHaveBeenCalledTimes(1);
    expect(mockRepository.claimDueDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('skips a sweep that overlaps a running one', async () => {
    const { worker, mockSendService } = buildWorker({});
    let releaseFirst: () => void = () => undefined;
    const firstSend = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mockSendService.processDelivery.mockImplementationOnce(() => firstSend);

    const first = worker.pollOnce();
    await Promise.resolve();
    const second = await worker.pollOnce();
    releaseFirst();

    expect(second).toBe(0);
    await expect(first).resolves.toBe(2);
  });

  it('swallows a failed sweep so the timer keeps running', async () => {
    const { worker, mockRepository } = buildWorker({});
    mockRepository.claimDueDeliveries.mockRejectedValue(new Error('db down'));

    await expect(worker.pollOnce()).resolves.toBe(0);
  });

  it('does not start polling when disabled', () => {
    const { worker } = buildWorker({ DELIVERY_WORKER_ENABLED: 'false' });
    jest.useFakeTimers();

    worker.onApplicationBootstrap();

    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('polls on the configured interval and stops on shutdown', async () => {
    const { worker, mockRepository } = buildWorker({ DELIVERY_WORKER_POLL_INTERVAL_MS: '1000' });
    jest.useFakeTimers();

    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1000);
    worker.onApplicationShutdown();

    expect(mockRepository.claimDueDeliveries).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
