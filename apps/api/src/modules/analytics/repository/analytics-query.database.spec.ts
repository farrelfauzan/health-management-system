import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { AnalyticsQueryRepository } from './analytics-query.repository';

/**
 * P29-T02 against a real PostgreSQL: the timeout and the read-only flag are
 * Postgres's to enforce, so a mock proves nothing about either.
 */
describe('Analytics query runner against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: AnalyticsQueryRepository;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new AnalyticsQueryRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('answers a query that finishes in time', async () => {
    const actual = await repository.runReadOnly((tx) =>
      tx.$queryRawUnsafe<Array<{ one: number }>>('SELECT 1 AS one'),
    );

    expect(actual).toEqual([{ one: 1 }]);
  });

  it('turns a query forced past the timeout into ANALYTICS_QUERY_TIMEOUT', async () => {
    const actual = repository.runReadOnly((tx) => tx.$queryRawUnsafe('SELECT pg_sleep(2)'), {
      statementTimeoutMs: 200,
    });

    await expect(actual).rejects.toMatchObject({ response: { code: 'ANALYTICS_QUERY_TIMEOUT' } });
  });

  it('refuses a write, because the transaction is read-only', async () => {
    const actual = repository.runReadOnly((tx) =>
      tx.$executeRawUnsafe('CREATE TEMP TABLE analytics_write_probe (id int)'),
    );

    await expect(actual).rejects.toThrow(/read-only transaction/);
  });
});
