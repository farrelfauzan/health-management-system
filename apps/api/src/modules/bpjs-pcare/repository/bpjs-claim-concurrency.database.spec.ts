import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BpjsSubmissionRepository } from './bpjs-submission.repository';

const QUEUE_SIZE = 6;
const CLAIM_LIMIT = 5;
const LEASE_MS = 1_800_000;

/**
 * The horizontal-scaling guarantee behind SJ-76, proven against a real
 * PostgreSQL rather than a mock: two workers polling the same outbox at the
 * same instant must divide the queue, never both take a row. A plain
 * `SELECT … WHERE status = 'PENDING'` passes every in-process test and still
 * reports each visit to BPJS twice the moment a second replica exists, so
 * `FOR UPDATE SKIP LOCKED` is only observable here.
 */
describe('BPJS outbox claim concurrency against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: BpjsSubmissionRepository;
  let patientId: string;
  const registrationIds: string[] = [];
  const submissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new BpjsSubmissionRepository(
      prisma,
      new NationalIdentifierCryptoService(new ConfigService()),
    );

    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `BPJS-CLAIM-${randomUUID()}`,
        fullName: 'BPJS Claim Race Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        phoneNumber: '+6280000000000',
        address: 'Test address',
      },
    });
    patientId = patient.id;

    for (let index = 0; index < QUEUE_SIZE; index += 1) {
      const registration = await prisma.registration.create({
        data: { patientId, status: 'COMPLETED', checkedInAt: new Date() },
      });
      // One row per registration rather than several types on one: the outbox
      // is unique on (registrationId, type), and the claim orders by due time
      // alone, so distinct visits are the honest shape of a contended queue.
      const submission = await prisma.bpjsSubmission.create({
        data: {
          registrationId: registration.id,
          type: 'PENDAFTARAN',
          status: 'PENDING',
          // Staggered into the past so the claim's ORDER BY is deterministic
          // and every row is unambiguously due.
          nextAttemptAt: new Date(Date.now() - (QUEUE_SIZE - index) * 1000),
        },
      });
      registrationIds.push(registration.id);
      submissionIds.push(submission.id);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.bpjsSubmission.deleteMany({ where: { id: { in: submissionIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.patientProfile.delete({ where: { id: patientId } });
    await prisma.$disconnect();
  });

  it('hands every queued row to exactly one of two concurrent workers', async () => {
    const [firstWorkerRows, secondWorkerRows] = await Promise.all([
      repository.claimDueSubmissions({ limit: CLAIM_LIMIT, leaseMs: LEASE_MS }),
      repository.claimDueSubmissions({ limit: CLAIM_LIMIT, leaseMs: LEASE_MS }),
    ]);
    const firstIds = firstWorkerRows.map((row) => row.id);
    const secondIds = secondWorkerRows.map((row) => row.id);
    const claimedIds = [...firstIds, ...secondIds];

    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds).toHaveLength(QUEUE_SIZE);
    expect(claimedIds.slice().sort()).toEqual(submissionIds.slice().sort());
    // The claim is raw SQL, so Prisma's column mapping does not apply and the
    // snake-case rename is the repository's own job. Asserting it on a claimed
    // row rather than a re-read one is the point: a regression here hands the
    // submission service a record whose registrationId is undefined, and every
    // send fails on data that is actually present.
    for (const claimedRow of [...firstWorkerRows, ...secondWorkerRows]) {
      expect(registrationIds).toContain(claimedRow.registrationId);
      expect(claimedRow.type).toBe('PENDAFTARAN');
      expect(claimedRow.status).toBe('PENDING');
      expect(claimedRow.attempts).toBe(0);
      expect(claimedRow.createdAt).toBeInstanceOf(Date);
    }
  });

  it('leaves a claimed row invisible to the next poll until its lease lapses', async () => {
    const actualRows = await repository.claimDueSubmissions({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
    });

    expect(actualRows).toHaveLength(0);
    const leased = await prisma.bpjsSubmission.findMany({
      where: { id: { in: submissionIds } },
      select: { status: true, nextAttemptAt: true },
    });
    for (const row of leased) {
      // Still PENDING: the lease is a due-time push, not a status change, so a
      // crashed worker's rows return to the queue on their own.
      expect(row.status).toBe('PENDING');
      expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
});
