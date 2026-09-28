import { ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '../../../common/prisma/prisma.service';
import { AnalyticsQueryRepository } from './analytics-query.repository';

describe('AnalyticsQueryRepository', () => {
  function buildRepository(transactionError?: unknown) {
    const mockTx = { $executeRawUnsafe: jest.fn(async () => 0) };
    const mockPrisma = {
      $transaction: jest.fn(async (work: (tx: typeof mockTx) => Promise<unknown>) => {
        if (transactionError) {
          throw transactionError;
        }
        return work(mockTx);
      }),
    };
    return {
      repository: new AnalyticsQueryRepository(mockPrisma as unknown as PrismaService),
      mockTx,
      mockPrisma,
    };
  }

  it('opens a read-only transaction with a ten-second statement timeout', async () => {
    const { repository, mockTx, mockPrisma } = buildRepository();

    const actual = await repository.runReadOnly(async () => 'figures');

    expect(actual).toBe('figures');
    expect(mockTx.$executeRawUnsafe.mock.calls).toEqual([
      ['SET TRANSACTION READ ONLY'],
      ['SET LOCAL statement_timeout = 10000'],
    ]);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });

  it('turns a cancelled statement into ANALYTICS_QUERY_TIMEOUT', async () => {
    const inputError = Object.assign(new Error('Raw query failed'), {
      code: 'P2010',
      meta: { code: '57014', message: 'canceling statement due to statement timeout' },
    });
    const { repository } = buildRepository(inputError);

    const actual = repository.runReadOnly(async () => 'figures');

    await expect(actual).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(actual).rejects.toMatchObject({
      response: { code: 'ANALYTICS_QUERY_TIMEOUT' },
    });
  });

  it('lets any other error through unchanged', async () => {
    const inputError = new Error('connection refused');
    const { repository } = buildRepository(inputError);

    await expect(repository.runReadOnly(async () => 'figures')).rejects.toBe(inputError);
  });
});
