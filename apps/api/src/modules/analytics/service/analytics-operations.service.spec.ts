import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnalyticsOperationsSnapshot } from '@hms/shared-types';

import type { AnalyticsOperationsRepository } from '../repository/analytics-operations.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsOperationsService } from './analytics-operations.service';
import { AnalyticsRangeService } from './analytics-range.service';

describe('AnalyticsOperationsService', () => {
  const EMPTY_SNAPSHOT: AnalyticsOperationsSnapshot = {
    visitBuckets: [],
    newAndReturning: { newPatients: 0, returningPatients: 0 },
    poli: [],
    doctors: [],
    outcomes: [],
    channels: [],
    walkIns: 0,
  };

  function buildService() {
    const mockRepository = { readSnapshot: jest.fn(async () => EMPTY_SNAPSHOT) };
    const service = new AnalyticsOperationsService(
      new AnalyticsRangeService(new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' })),
      new AnalyticsCacheService(),
      mockRepository as unknown as AnalyticsOperationsRepository,
    );
    return { service, mockRepository };
  }

  it('reads one period and binds its UTC bounds and filters', async () => {
    const { service, mockRepository } = buildService();

    const actual = await service.getOperations({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: false,
      doctorId: '33333333-3333-4333-8333-333333333333',
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(1);
    expect(mockRepository.readSnapshot).toHaveBeenCalledWith({
      startUtc: '2026-08-31 17:00:00.000',
      endUtc: '2026-09-30 17:00:00.000',
      granularity: 'day',
      timeZone: 'Asia/Jakarta',
      doctorId: '33333333-3333-4333-8333-333333333333',
      specialtyId: undefined,
    });
    expect(actual.meta).toMatchObject({ from: '2026-09-01', to: '2026-09-30', granularity: 'day' });
    expect(actual.data.comparison).toBeUndefined();
  });

  it('reads the comparison period too when compare is on', async () => {
    const { service, mockRepository } = buildService();

    const actual = await service.getOperations({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(2);
    expect(mockRepository.readSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startUtc: '2026-07-31 17:00:00.000',
        endUtc: '2026-08-31 17:00:00.000',
      }),
    );
    expect(actual.data.comparison).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('answers the same filter from cache', async () => {
    const { service, mockRepository } = buildService();
    const inputFilter = { from: '2026-09-01', to: '2026-09-30', compare: false };

    await service.getOperations(inputFilter);
    await service.getOperations({ ...inputFilter });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(1);
  });

  it('refuses a payer filter until visits record the payer', async () => {
    const { service, mockRepository } = buildService();

    const actual = () =>
      service.getOperations({
        from: '2026-09-01',
        to: '2026-09-30',
        compare: false,
        payerType: 'BPJS',
      });

    expect(actual).toThrow(BadRequestException);
    expect(mockRepository.readSnapshot).not.toHaveBeenCalled();
  });
});
