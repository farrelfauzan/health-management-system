import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { LabDailyNumberAllocatorRepository } from './repository/lab-daily-number-allocator.repository';

/**
 * The one property no unit test can prove: that two doctors ordering at the
 * same moment never receive the same order number, and two analysts collecting
 * at once never print the same barcode (P18-T02, P18-T03).
 *
 * A duplicate accession number is the worst failure in this module — it is a
 * result filed against the wrong person — so this runs against real Postgres,
 * where the row lock behind `INSERT … ON CONFLICT … RETURNING` actually exists.
 *
 * Synthetic far-future days keep a shared dev database's live counters
 * untouched; the rows are removed around each run so day one starts at 1.
 */
describe('Lab number allocation against Postgres', () => {
  const CONCURRENT_ALLOCATIONS = 25;
  const firstDate = new Date('2099-02-10T00:00:00.000Z');
  const secondDate = new Date('2099-02-11T00:00:00.000Z');

  let prisma: PrismaService;
  let allocator: LabDailyNumberAllocatorRepository;

  async function deleteTestCounters(): Promise<void> {
    await prisma.labOrderCounter.deleteMany({
      where: { orderDate: { in: [firstDate, secondDate] } },
    });
    await prisma.labSpecimenCounter.deleteMany({
      where: { collectionDate: { in: [firstDate, secondDate] } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    allocator = new LabDailyNumberAllocatorRepository();
    await deleteTestCounters();
  });

  afterAll(async () => {
    await deleteTestCounters();
    await prisma.$disconnect();
  });

  it('hands every concurrent order a distinct consecutive number starting at 1', async () => {
    const actualNumbers = await Promise.all(
      Array.from({ length: CONCURRENT_ALLOCATIONS }, () =>
        prisma.executeTransaction((tx) => allocator.allocateOrderNumber(tx, firstDate)),
      ),
    );

    expect(new Set(actualNumbers).size).toBe(CONCURRENT_ALLOCATIONS);
    expect([...actualNumbers].sort()[0]).toBe('LAB/20990210/0001');
  });

  it('hands every concurrent draw a distinct accession number', async () => {
    const actualNumbers = await Promise.all(
      Array.from({ length: CONCURRENT_ALLOCATIONS }, () =>
        prisma.executeTransaction((tx) => allocator.allocateAccessionNumber(tx, firstDate)),
      ),
    );

    expect(new Set(actualNumbers).size).toBe(CONCURRENT_ALLOCATIONS);
    expect([...actualNumbers].sort()[0]).toBe('SPC/20990210/0001');
  });

  // Order and accession sequences are separate counters, so a busy morning of
  // ordering never pushes the barcode sequence forward.
  it('keeps the two sequences independent and restarts both each day', async () => {
    const [actualOrderNumber, actualAccessionNumber] = await Promise.all([
      prisma.executeTransaction((tx) => allocator.allocateOrderNumber(tx, secondDate)),
      prisma.executeTransaction((tx) => allocator.allocateAccessionNumber(tx, secondDate)),
    ]);

    expect(actualOrderNumber).toBe('LAB/20990211/0001');
    expect(actualAccessionNumber).toBe('SPC/20990211/0001');
  });

  it('returns a rolled-back order number to the pool instead of leaving a gap', async () => {
    const inputRolledBackNumber = await prisma
      .executeTransaction(async (tx) => {
        const allocated = await allocator.allocateOrderNumber(tx, secondDate);
        throw new Error(`rollback:${allocated}`);
      })
      .catch((err: Error) => err.message.replace('rollback:', ''));

    const actualNextNumber = await prisma.executeTransaction((tx) =>
      allocator.allocateOrderNumber(tx, secondDate),
    );

    // Sharing the caller's transaction means the counter increment rolls back
    // with the failed insert. Reuse is safe precisely because it is atomic: the
    // abandoned number was never committed to an order, so nothing was ever
    // filed under it.
    expect(actualNextNumber).toBe(inputRolledBackNumber);
  });
});
