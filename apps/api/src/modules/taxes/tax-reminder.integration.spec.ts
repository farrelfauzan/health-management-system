import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { TaxReminderRepository } from './repository/tax-reminder.repository';

/**
 * What "raise it once" is worth only the database can say (P27-T10).
 *
 * The claim is a unique index, not a read-then-write, and a mocked repository
 * would agree with whatever this spec asserted. Two sweeps overlapping — a
 * restart while one is mid-flight — would both see nothing and both announce;
 * letting the insert lose is the only version of this that holds under
 * concurrency.
 */
describe('Tax reminder claims against Postgres', () => {
  let prisma: PrismaService;
  let repository: TaxReminderRepository;

  const claimedKeys: string[] = [];

  function buildKey(suffix: string): string {
    const key = `SPEC:${randomUUID()}:${suffix}`;
    claimedKeys.push(key);
    return key;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new TaxReminderRepository(prisma);
  });

  afterAll(async () => {
    await prisma.taxReminderNotice.deleteMany({ where: { noticeKey: { in: claimedKeys } } });
    await prisma.$disconnect();
  });

  it('claims a reminder once and refuses the same claim afterwards', async () => {
    const noticeKey = buildKey('DUE');

    await expect(repository.claimNotice('OBLIGATION_DUE', noticeKey)).resolves.toBe(true);
    await expect(repository.claimNotice('OBLIGATION_DUE', noticeKey)).resolves.toBe(false);
  });

  it('lets exactly one of two concurrent sweeps win', async () => {
    const noticeKey = buildKey('RACE');

    const outcomes = await Promise.all([
      repository.claimNotice('TURNOVER_THRESHOLD', noticeKey),
      repository.claimNotice('TURNOVER_THRESHOLD', noticeKey),
      repository.claimNotice('TURNOVER_THRESHOLD', noticeKey),
    ]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it('keeps the three reminder families apart', async () => {
    const dueKey = buildKey('FAMILY-DUE');
    const turnoverKey = buildKey('FAMILY-TURNOVER');
    const pp55Key = buildKey('FAMILY-PP55');

    await expect(repository.claimNotice('OBLIGATION_DUE', dueKey)).resolves.toBe(true);
    await expect(repository.claimNotice('TURNOVER_THRESHOLD', turnoverKey)).resolves.toBe(true);
    await expect(repository.claimNotice('PP55_LAST_YEAR', pp55Key)).resolves.toBe(true);

    const rows = await prisma.taxReminderNotice.findMany({
      where: { noticeKey: { in: [dueKey, turnoverKey, pp55Key] } },
      select: { kind: true },
    });
    expect(rows.map((row) => row.kind).sort()).toEqual([
      'OBLIGATION_DUE',
      'PP55_LAST_YEAR',
      'TURNOVER_THRESHOLD',
    ]);
  });

  it('reports no finalized periods when asked about none', async () => {
    // The empty case is the one a non-PKP clinic hits on every sweep, and a
    // query built from an empty `in` list is the kind of thing that returns
    // everything.
    await expect(repository.listFinalizedPeriods([], 'PPN_OUTPUT')).resolves.toEqual([]);
  });
});
