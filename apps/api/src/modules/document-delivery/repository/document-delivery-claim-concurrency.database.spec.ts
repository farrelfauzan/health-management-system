import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentDeliveryRepository } from './document-delivery.repository';

const QUEUE_SIZE = 6;
const CLAIM_LIMIT = 5;
const LEASE_MS = 120_000;
const MARKER = `p16t26-race-${randomUUID()}`;

/**
 * The horizontal-scaling guarantee behind FR-E4-13, proven against a real
 * PostgreSQL rather than a mock: two workers polling the outbox at the same
 * instant must divide the queue, never both take a row — a plain
 * `SELECT … WHERE status = 'QUEUED'` passes every in-process test and still
 * sends one bill twice the moment a second replica exists. The same sweep
 * also has to leave alone what is not due: a send scheduled for later
 * (`P16-T38`), a row under another replica's lease, and one still in its
 * backoff.
 */
describe('Delivery outbox claim concurrency against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: DocumentDeliveryRepository;
  let patientId: string;
  let invoiceId: string;
  let invoiceDocumentId: string;
  let doctorId: string;
  let specialtyId: string;
  let admissionId: string;

  async function seedDelivery(overrides: {
    sendAt?: Date;
    nextAttemptAt?: Date;
    leasedUntil?: Date;
  }): Promise<string> {
    const row = await prisma.documentDelivery.create({
      data: {
        patientId,
        invoiceId,
        invoiceDocumentId,
        channel: 'WHATSAPP',
        destinationMasked: '6281****0000',
        sendAt: overrides.sendAt ?? null,
        nextAttemptAt: overrides.nextAttemptAt ?? null,
        leasedUntil: overrides.leasedUntil ?? null,
        leasedBy: overrides.leasedUntil === undefined ? null : 'other-replica',
      },
      select: { id: true },
    });
    return row.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new DocumentDeliveryRepository(prisma);
    const specialty = await prisma.specialty.create({
      data: { name: MARKER },
      select: { id: true },
    });
    specialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: { licenseNumber: MARKER, fullName: 'dr. Race', specialtyId },
      select: { id: true },
    });
    doctorId = doctor.id;
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: MARKER,
        fullName: 'Race Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'MALE',
        phoneNumber: '0812-0000-0000',
        address: 'Jl. Uji',
      },
      select: { id: true },
    });
    patientId = patient.id;
    const admission = await prisma.admission.create({
      data: {
        patientId,
        admittingDoctorId: doctorId,
        status: 'DISCHARGED',
        admittedAt: new Date(Date.now() - 3_600_000),
        dischargedAt: new Date(),
      },
      select: { id: true },
    });
    admissionId = admission.id;
    const invoice = await prisma.invoice.create({
      data: { invoiceNumber: MARKER, admissionId, patientId, status: 'PAID', totalAmount: 1000 },
      select: { id: true },
    });
    invoiceId = invoice.id;
    const document = await prisma.invoiceDocument.create({
      data: {
        invoiceId,
        renderedData: {},
        status: 'READY',
        storageKey: `${MARKER}.pdf`,
        checksum: 'b'.repeat(64),
        sizeBytes: 10,
      },
      select: { id: true },
    });
    invoiceDocumentId = document.id;
  });

  afterAll(async () => {
    await prisma.documentDelivery.deleteMany({ where: { invoiceId } });
    await prisma.invoiceDocument.deleteMany({ where: { invoiceId } });
    await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    await prisma.admission.deleteMany({ where: { id: admissionId } });
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await prisma.$disconnect();
  });

  it('hands each due row to exactly one of two concurrent claimers', async () => {
    const dueIds = await Promise.all(Array.from({ length: QUEUE_SIZE }, () => seedDelivery({})));

    const [first, second] = await Promise.all([
      repository.claimDueDeliveries({
        limit: CLAIM_LIMIT,
        leaseMs: LEASE_MS,
        leasedBy: 'replica-a',
      }),
      repository.claimDueDeliveries({
        limit: CLAIM_LIMIT,
        leaseMs: LEASE_MS,
        leasedBy: 'replica-b',
      }),
    ]);

    const claimedIds = [...first, ...second].map((row) => row.id);
    expect(claimedIds).toHaveLength(QUEUE_SIZE);
    expect(new Set(claimedIds).size).toBe(QUEUE_SIZE);
    expect(claimedIds.sort()).toEqual([...dueIds].sort());
    expect(first.every((row) => row.leasedBy === 'replica-a')).toBe(true);
    expect(second.every((row) => row.leasedBy === 'replica-b')).toBe(true);
  });

  it('leaves a leased row alone until the lease lapses', async () => {
    const leftAlone = await repository.claimDueDeliveries({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
      leasedBy: 'replica-c',
    });

    expect(leftAlone).toEqual([]);
  });

  it('skips a scheduled send, a row in backoff, and a row under a live lease', async () => {
    const future = new Date(Date.now() + 3_600_000);
    const scheduled = await seedDelivery({ sendAt: future });
    const backingOff = await seedDelivery({ nextAttemptAt: future });
    const leased = await seedDelivery({ leasedUntil: future });
    const due = await seedDelivery({ sendAt: new Date(Date.now() - 1_000) });

    const claimed = await repository.claimDueDeliveries({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
      leasedBy: 'replica-d',
    });

    expect(claimed.map((row) => row.id)).toEqual([due]);
    expect(claimed.map((row) => row.id)).not.toEqual(
      expect.arrayContaining([scheduled, backingOff, leased]),
    );
  });
});
