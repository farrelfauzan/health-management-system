import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SatusehatSubmissionRepository } from './satusehat-submission.repository';

const QUEUE_SIZE = 6;
const CLAIM_LIMIT = 5;
const LEASE_MS = 900_000;

/**
 * The horizontal-scaling guarantee behind SJ-76, proven against a real
 * PostgreSQL rather than a mock: two workers polling the same outbox at the
 * same instant must divide the queue, never both take a row. A plain
 * `SELECT … WHERE status = 'PENDING'` passes every in-process test and still
 * submits each encounter to Kemenkes twice the moment a second replica exists,
 * so `FOR UPDATE SKIP LOCKED` is only observable here.
 */
describe('SATUSEHAT outbox claim concurrency against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: SatusehatSubmissionRepository;
  let specialtyId: string;
  let patientId: string;
  let doctorId: string;
  const encounterIds: string[] = [];
  const registrationIds: string[] = [];
  const submissionIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new SatusehatSubmissionRepository(
      prisma,
      new NationalIdentifierCryptoService(new ConfigService()),
    );

    const specialty = await prisma.specialty.create({
      data: { name: `Claim Race ${randomUUID()}` },
    });
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `CLAIM-${randomUUID()}`,
        fullName: 'Claim Race Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        phoneNumber: '+6280000000000',
        address: 'Test address',
      },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `CLAIM-${randomUUID()}`,
        fullName: 'Claim Race Doctor',
        specialtyId: specialty.id,
      },
    });
    specialtyId = specialty.id;
    patientId = patient.id;
    doctorId = doctor.id;

    for (let index = 0; index < QUEUE_SIZE; index += 1) {
      const registration = await prisma.registration.create({
        data: { patientId, status: 'COMPLETED', checkedInAt: new Date() },
      });
      const encounter = await prisma.encounter.create({
        data: {
          registrationId: registration.id,
          patientId,
          doctorId,
          status: 'FINISHED',
          endedAt: new Date(),
        },
      });
      const submission = await prisma.satusehatSubmission.create({
        data: {
          encounterId: encounter.id,
          status: 'PENDING',
          // Staggered into the past so the claim's ORDER BY is deterministic
          // and every row is unambiguously due.
          nextAttemptAt: new Date(Date.now() - (QUEUE_SIZE - index) * 1000),
        },
      });
      registrationIds.push(registration.id);
      encounterIds.push(encounter.id);
      submissionIds.push(submission.id);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.satusehatSubmission.deleteMany({ where: { id: { in: submissionIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: encounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.doctorProfile.delete({ where: { id: doctorId } });
    await prisma.patientProfile.delete({ where: { id: patientId } });
    await prisma.specialty.delete({ where: { id: specialtyId } });
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
  });

  it('leaves a claimed row invisible to the next poll until its lease lapses', async () => {
    const actualRows = await repository.claimDueSubmissions({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
    });

    expect(actualRows).toHaveLength(0);
    const leased = await prisma.satusehatSubmission.findMany({
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
