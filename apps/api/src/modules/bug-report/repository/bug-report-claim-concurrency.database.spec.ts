import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { BugReportRepository } from './bug-report.repository';

const QUEUE_SIZE = 6;
const CLAIM_LIMIT = 5;
const LEASE_MS = 120_000;
const MARKER = `p23t09-race-${randomUUID()}`;

/**
 * The horizontal-scaling guarantee behind P23-T09 and P23-T10, proven against a
 * real PostgreSQL rather than a mock.
 *
 * A plain `SELECT … WHERE status = 'RECEIVED'` passes every in-process test and
 * still breaks the moment a second replica exists — and here it breaks twice
 * over, in ways that matter more than a double-send usually does. On the triage
 * side, two claimers means one report's text goes to the AI vendor twice, which
 * is a second copy of possibly-sensitive prose at a third party. On the publish
 * side it means two Notion pages for one bug, because page creation is not
 * idempotent.
 *
 * The sweep also has to leave alone what is not due: a row in its backoff, and a
 * row under another replica's live lease.
 */
describe('Bug report claim concurrency against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: BugReportRepository;
  let reporterUserId: string;
  let roleId: string;
  const seededReportIds: string[] = [];

  async function seedReport(overrides: {
    status?: 'RECEIVED' | 'TRIAGED';
    nextAttemptAt?: Date;
    leasedUntil?: Date;
  }): Promise<string> {
    const row = await prisma.bugReport.create({
      data: {
        // `randomUUID` rather than the array length: these are seeded with
        // `Promise.all`, so every call would read the same length before any of
        // them pushed, and the unique index would reject five of six.
        reference: `${MARKER}-${randomUUID()}`,
        reporterUserId,
        reporterRole: 'DOCTOR',
        title: 'Race title',
        description: 'Race description',
        pagePath: '/admin',
        requestIds: [],
        userAgent: 'jest',
        acknowledgedNoSensitiveDataAt: new Date(),
        status: overrides.status ?? 'RECEIVED',
        nextAttemptAt: overrides.nextAttemptAt ?? null,
        leasedUntil: overrides.leasedUntil ?? null,
        leasedBy: overrides.leasedUntil === undefined ? null : 'other-replica',
      },
      select: { id: true },
    });
    seededReportIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new BugReportRepository(prisma);
    const role = await prisma.role.create({
      data: { code: MARKER, name: 'Race Role' },
      select: { id: true },
    });
    roleId = role.id;
    const user = await prisma.user.create({
      data: { email: `${MARKER}@example.test`, passwordHash: 'x'.repeat(60) },
      select: { id: true },
    });
    reporterUserId = user.id;
  });

  afterAll(async () => {
    await prisma.bugReport.deleteMany({ where: { reporterUserId } });
    await prisma.user.deleteMany({ where: { id: reporterUserId } });
    await prisma.role.deleteMany({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  it('hands each due report to exactly one of two concurrent claimers', async () => {
    const dueIds = await Promise.all(
      Array.from({ length: QUEUE_SIZE }, () => seedReport({ status: 'RECEIVED' })),
    );

    const [first, second] = await Promise.all([
      repository.claimDueReports({
        status: 'RECEIVED',
        limit: CLAIM_LIMIT,
        leaseMs: LEASE_MS,
        leasedBy: 'replica-a',
      }),
      repository.claimDueReports({
        status: 'RECEIVED',
        limit: CLAIM_LIMIT,
        leaseMs: LEASE_MS,
        leasedBy: 'replica-b',
      }),
    ]);

    const claimedIds = [...first, ...second];
    expect(claimedIds).toHaveLength(QUEUE_SIZE);
    expect(new Set(claimedIds).size).toBe(QUEUE_SIZE);
    expect([...claimedIds].sort()).toEqual([...dueIds].sort());
  });

  it('leaves a report it already claimed alone until the lease lapses', async () => {
    const leftAlone = await repository.claimDueReports({
      status: 'RECEIVED',
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
      leasedBy: 'replica-c',
    });

    expect(leftAlone).toEqual([]);
  });

  /**
   * The two halves claim from different statuses, so a triage sweep must not pick
   * up a report waiting to be published — otherwise one report is sent to the AI
   * vendor again after it has already been triaged.
   */
  it('never claims a TRIAGED report on a RECEIVED sweep', async () => {
    await seedReport({ status: 'TRIAGED' });

    const triageClaims = await repository.claimDueReports({
      status: 'RECEIVED',
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
      leasedBy: 'replica-d',
    });

    expect(triageClaims).toEqual([]);
  });

  it('claims a TRIAGED report on a publish sweep', async () => {
    const publishClaims = await repository.claimDueReports({
      status: 'TRIAGED',
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
      leasedBy: 'replica-e',
    });

    expect(publishClaims).toHaveLength(1);
  });

  it('skips a report in its backoff and one under a live lease', async () => {
    const future = new Date(Date.now() + 3_600_000);
    const backingOff = await seedReport({ status: 'RECEIVED', nextAttemptAt: future });
    const leased = await seedReport({ status: 'RECEIVED', leasedUntil: future });

    const claimed = await repository.claimDueReports({
      status: 'RECEIVED',
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
      leasedBy: 'replica-f',
    });

    expect(claimed).not.toContain(backingOff);
    expect(claimed).not.toContain(leased);
  });
});
