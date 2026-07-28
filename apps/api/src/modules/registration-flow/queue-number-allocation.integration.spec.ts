import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueNumberAllocatorRepository } from './repository/queue-number-allocator.repository';

/**
 * The one property no unit test can prove: that concurrent registrations never
 * receive the same antrian number. Front-desk staff and the self-service flow
 * register patients at the same moment, and a duplicate ticket calls two
 * patients at once — so this runs against real Postgres, where the row lock
 * behind `INSERT … ON CONFLICT … RETURNING` actually exists.
 */
describe('Queue number allocation against Postgres', () => {
  const CONCURRENT_ALLOCATIONS = 25;
  // Synthetic far-future days so a shared dev database's live counters are
  // never touched; the rows are removed around each run so day one always
  // starts at ticket 1.
  const firstQueueDate = new Date('2099-01-15T00:00:00.000Z');
  const secondQueueDate = new Date('2099-01-16T00:00:00.000Z');

  let prisma: PrismaService;
  let allocator: QueueNumberAllocatorRepository;

  async function deleteTestCounters(): Promise<void> {
    await prisma.queueCounter.deleteMany({
      where: {
        queueDate: {
          in: [firstQueueDate, secondQueueDate],
        },
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    allocator = new QueueNumberAllocatorRepository();
    await deleteTestCounters();
  });

  afterAll(async () => {
    await deleteTestCounters();
    await prisma.$disconnect();
  });

  it('hands every concurrent caller a distinct consecutive number starting at 1', async () => {
    const actualNumbers = await Promise.all(
      Array.from({ length: CONCURRENT_ALLOCATIONS }, () =>
        prisma.executeTransaction((tx) => allocator.allocateQueueNumber(tx, firstQueueDate)),
      ),
    );

    const sortedNumbers = [...actualNumbers].sort((left, right) => left - right);

    expect(new Set(actualNumbers).size).toBe(CONCURRENT_ALLOCATIONS);
    expect(sortedNumbers[0]).toBe(1);
    expect(sortedNumbers[sortedNumbers.length - 1]).toBe(CONCURRENT_ALLOCATIONS);
  });

  it('starts a fresh sequence for each calendar day', async () => {
    const actualFirstOfDay = await prisma.executeTransaction((tx) =>
      allocator.allocateQueueNumber(tx, secondQueueDate),
    );

    expect(actualFirstOfDay).toBe(1);
  });

  it('returns a rolled-back number to the pool instead of leaving a gap', async () => {
    const inputRolledBackNumber = await prisma
      .executeTransaction(async (tx) => {
        const allocated = await allocator.allocateQueueNumber(tx, secondQueueDate);
        throw new Error(`rollback:${allocated}`);
      })
      .catch((err: Error) => Number(err.message.replace('rollback:', '')));

    const actualNextNumber = await prisma.executeTransaction((tx) =>
      allocator.allocateQueueNumber(tx, secondQueueDate),
    );

    // Sharing the caller's transaction means the counter increment rolls back
    // with the failed insert. Reuse is safe precisely because it is atomic:
    // the abandoned number was never committed to a registration, so no ticket
    // was ever called with it.
    expect(actualNextNumber).toBe(inputRolledBackNumber);
  });
});
