import { ConfigService } from '@nestjs/config';

import { MrnAllocatorRepository } from '../../common/mrn/mrn-allocator.repository';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The one property no unit test can prove: that concurrent registrations never
 * receive the same MRN. Front-desk staff and the self-service flow create
 * patients at the same moment, and a duplicate MRN silently merges two
 * patients' histories — so this runs against real Postgres, where the row lock
 * behind `UPDATE … RETURNING` actually exists.
 */
describe('MRN allocation against Postgres', () => {
  const CONCURRENT_ALLOCATIONS = 25;

  let prisma: PrismaService;
  let allocator: MrnAllocatorRepository;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    allocator = new MrnAllocatorRepository(new ConfigService());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('hands every concurrent caller a distinct number', async () => {
    const actualMrns = await Promise.all(
      Array.from({ length: CONCURRENT_ALLOCATIONS }, () =>
        prisma.executeTransaction((tx) => allocator.allocateMrn(tx)),
      ),
    );

    expect(new Set(actualMrns).size).toBe(CONCURRENT_ALLOCATIONS);
  });

  it('returns a rolled-back number to the pool instead of leaving a gap', async () => {
    const inputRolledBackMrn = await prisma
      .executeTransaction(async (tx) => {
        const allocated = await allocator.allocateMrn(tx);
        throw new Error(`rollback:${allocated}`);
      })
      .catch((err: Error) => err.message.replace('rollback:', ''));

    const actualNextMrn = await prisma.executeTransaction((tx) => allocator.allocateMrn(tx));

    // Sharing the caller's transaction means the counter increment rolls back
    // with the failed insert. Reuse is safe precisely because it is atomic: the
    // abandoned number was never committed to a patient record, so no folder
    // was ever printed with it.
    expect(actualNextMrn).toBe(inputRolledBackMrn);
  });

  it('lifts the counter past an imported legacy MRN', async () => {
    // Derived from where the counter already sits rather than a fixed large
    // number, so running this against a shared dev database advances it by a
    // few values instead of millions.
    const inputCurrentMrn = await prisma.executeTransaction((tx) => allocator.allocateMrn(tx));
    const inputImportedMrn = allocator.formatMrn(BigInt(Number(inputCurrentMrn) + 10));

    await prisma.executeTransaction((tx) => allocator.raiseCounterAbove(tx, inputImportedMrn));
    const actualNextMrn = await prisma.executeTransaction((tx) => allocator.allocateMrn(tx));

    expect(Number(actualNextMrn)).toBeGreaterThan(Number(inputImportedMrn));
  });

  it('leaves the counter alone for an import it could never have allocated', async () => {
    const inputBeforeMrn = await prisma.executeTransaction((tx) => allocator.allocateMrn(tx));

    await prisma.executeTransaction((tx) => allocator.raiseCounterAbove(tx, 'RM/2019/0417'));
    const actualNextMrn = await prisma.executeTransaction((tx) => allocator.allocateMrn(tx));

    expect(Number(actualNextMrn)).toBe(Number(inputBeforeMrn) + 1);
  });
});
