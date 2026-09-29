import { ConfigService } from '@nestjs/config';
import type { AnalyticsFinanceSnapshot } from '@hms/shared-types';

import type { AnalyticsFinanceRepository } from '../repository/analytics-finance.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsFinanceService } from './analytics-finance.service';
import { AnalyticsRangeService } from './analytics-range.service';

describe('AnalyticsFinanceService', () => {
  const EMPTY_SNAPSHOT: AnalyticsFinanceSnapshot = {
    revenueBuckets: [],
    cashBuckets: [],
    paymentMethods: [],
    itemTypes: [],
    doctors: [],
    poli: [],
    payerRevenue: [],
    payerVisits: [],
    invoicedVisits: 0,
    voids: { invoices: 0, amountCents: 0 },
    outstanding: [],
  };

  function buildService() {
    const mockRepository = { readSnapshot: jest.fn(async () => EMPTY_SNAPSHOT) };
    const service = new AnalyticsFinanceService(
      new AnalyticsRangeService(new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta' })),
      new AnalyticsCacheService(),
      mockRepository as unknown as AnalyticsFinanceRepository,
    );
    return { service, mockRepository };
  }

  it('reads one period and binds its UTC bounds and every narrowing filter', async () => {
    const { service, mockRepository } = buildService();

    const actual = await service.getFinance({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: false,
      doctorId: '33333333-3333-4333-8333-333333333333',
      payerType: 'INSURANCE',
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(1);
    expect(mockRepository.readSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        startUtc: '2026-08-31 17:00:00.000',
        endUtc: '2026-09-30 17:00:00.000',
        doctorId: '33333333-3333-4333-8333-333333333333',
        payerType: 'INSURANCE',
      }),
    );
    expect(actual.meta).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(actual.data.comparison).toBeUndefined();
  });

  it('reads the previous month too when compare is on', async () => {
    const { service, mockRepository } = buildService();

    const actual = await service.getFinance({
      from: '2026-09-01',
      to: '2026-09-30',
      compare: true,
    });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(2);
    expect(actual.data.comparison).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('answers the same filter from cache', async () => {
    const { service, mockRepository } = buildService();
    const inputFilter = { from: '2026-09-01', to: '2026-09-30', compare: false };

    await service.getFinance(inputFilter);
    await service.getFinance({ ...inputFilter });

    expect(mockRepository.readSnapshot).toHaveBeenCalledTimes(1);
  });
});
