import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SatusehatSubmissionRepository } from './satusehat-submission.repository';

const LEASE_MS = 900_000;
const CLAIM_LIMIT = 20;

/**
 * The ordering guarantee behind P18-T09, proven against a real PostgreSQL
 * because the gate lives entirely in the claim statement's SQL.
 *
 * A DiagnosticReport has to reference `Encounter/{ihs}`, so a lab report must
 * not be sent before the encounter that produced it. The rule has three
 * outcomes and only the middle one is obvious: an encounter still PENDING
 * makes the report wait *silently* — it is early, not broken — while a settled
 * encounter, succeeded or failed, makes it actionable. A mock cannot show any
 * of this; a plain `WHERE status = 'PENDING'` passes every in-process test and
 * still posts reports that reference an encounter Kemenkes has never seen.
 */
describe('SATUSEHAT lab report encounter gate against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: SatusehatSubmissionRepository;
  let specialtyId: string;
  let patientId: string;
  let doctorId: string;
  let labTestId: string;
  const createdSubmissionIds: string[] = [];
  const createdLabOrderIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdRegistrationIds: string[] = [];

  /**
   * One encounter with a released lab order on it, plus the outbox rows for
   * both. `encounterStatus` null leaves the encounter unenqueued entirely,
   * which is the "visit still open" case.
   */
  async function seedOrderWithEncounter(
    encounterSubmissionStatus: 'PENDING' | 'SUBMITTED' | 'FAILED' | null,
  ): Promise<{ labReportSubmissionId: string; labOrderId: string }> {
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
    createdRegistrationIds.push(registration.id);
    createdEncounterIds.push(encounter.id);
    if (encounterSubmissionStatus !== null) {
      const encounterSubmission = await prisma.satusehatSubmission.create({
        data: {
          kind: 'ENCOUNTER',
          encounterId: encounter.id,
          status: encounterSubmissionStatus,
          satusehatEncounterId:
            encounterSubmissionStatus === 'SUBMITTED' ? `ihs-${randomUUID()}` : null,
        },
      });
      createdSubmissionIds.push(encounterSubmission.id);
    }
    const labOrder = await prisma.labOrder.create({
      data: {
        encounterId: encounter.id,
        patientId,
        orderedById: doctorId,
        orderNumber: `LAB/GATE/${randomUUID()}`,
        status: 'RELEASED',
        releasedAt: new Date(),
        items: { create: [{ labTestId }] },
      },
    });
    createdLabOrderIds.push(labOrder.id);
    const labReportSubmission = await prisma.satusehatSubmission.create({
      data: {
        kind: 'LAB_REPORT',
        labOrderId: labOrder.id,
        status: 'PENDING',
        // Explicitly in the past rather than relying on the `now()` default:
        // the client sets that from the host clock while the claim compares it
        // against the database's, and a container running a few milliseconds
        // behind makes "is this row due" a coin toss.
        nextAttemptAt: new Date(Date.now() - 60_000),
      },
    });
    createdSubmissionIds.push(labReportSubmission.id);
    return { labReportSubmissionId: labReportSubmission.id, labOrderId: labOrder.id };
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new SatusehatSubmissionRepository(
      prisma,
      new NationalIdentifierCryptoService(new ConfigService()),
    );
    const specialty = await prisma.specialty.create({
      data: { name: `Lab Gate ${randomUUID()}` },
    });
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'MALE',
        mrn: `GATE-${randomUUID()}`,
        fullName: 'Lab Gate Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        phoneNumber: '+6280000000001',
        address: 'Test address',
      },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `GATE-${randomUUID()}`,
        fullName: 'Lab Gate Doctor',
        specialtyId: specialty.id,
      },
    });
    const labTest = await prisma.labTest.create({
      data: {
        code: `GATE-${randomUUID()}`.slice(0, 30),
        name: 'Gate Glucose',
        loincCode: '2345-7',
        specimenType: 'SERUM',
        resultType: 'NUMERIC',
        unit: 'mg/dL',
      },
    });
    specialtyId = specialty.id;
    patientId = patient.id;
    doctorId = doctor.id;
    labTestId = labTest.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.satusehatSubmission.deleteMany({ where: { id: { in: createdSubmissionIds } } });
    await prisma.labOrderItem.deleteMany({ where: { labOrderId: { in: createdLabOrderIds } } });
    await prisma.labOrder.deleteMany({ where: { id: { in: createdLabOrderIds } } });
    await prisma.encounter.deleteMany({ where: { id: { in: createdEncounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
    await prisma.labTest.delete({ where: { id: labTestId } });
    await prisma.doctorProfile.delete({ where: { id: doctorId } });
    await prisma.patientProfile.delete({ where: { id: patientId } });
    await prisma.specialty.delete({ where: { id: specialtyId } });
    await prisma.$disconnect();
  });

  it('does not claim a lab report while its encounter row is still PENDING', async () => {
    const { labReportSubmissionId } = await seedOrderWithEncounter('PENDING');

    const claimed = await repository.claimDueSubmissions({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
    });

    expect(claimed.map((row) => row.id)).not.toContain(labReportSubmissionId);
    // Untouched, not failed: waiting is the absence of a claim, so nothing on
    // the row moves and no lease is taken.
    const row = await prisma.satusehatSubmission.findUniqueOrThrow({
      where: { id: labReportSubmissionId },
    });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(0);
  });

  it('does not claim a lab report whose encounter was never enqueued', async () => {
    const { labReportSubmissionId } = await seedOrderWithEncounter(null);

    const claimed = await repository.claimDueSubmissions({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
    });

    expect(claimed.map((row) => row.id)).not.toContain(labReportSubmissionId);
  });

  it('claims a lab report once its encounter row is SUBMITTED', async () => {
    const { labReportSubmissionId, labOrderId } = await seedOrderWithEncounter('SUBMITTED');

    const claimed = await repository.claimDueSubmissions({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
    });

    const claimedRow = claimed.find((row) => row.id === labReportSubmissionId);
    expect(claimedRow).toBeDefined();
    expect(claimedRow?.kind).toBe('LAB_REPORT');
    expect(claimedRow?.labOrderId).toBe(labOrderId);
    expect(claimedRow?.encounterId).toBeNull();
    // The order number rides along so the monitor can name the row without a
    // second read, and without exposing anything clinical.
    expect(claimedRow?.labOrderNumber).toMatch(/^LAB\/GATE\//);
  });

  it('claims a lab report whose encounter FAILED, so it can be parked with a reason', async () => {
    const { labReportSubmissionId } = await seedOrderWithEncounter('FAILED');

    const claimed = await repository.claimDueSubmissions({
      limit: CLAIM_LIMIT,
      leaseMs: LEASE_MS,
    });

    expect(claimed.map((row) => row.id)).toContain(labReportSubmissionId);
  });

  it('re-opens reports parked on an encounter once that encounter is retried', async () => {
    const { labReportSubmissionId } = await seedOrderWithEncounter('FAILED');
    const parked = await prisma.satusehatSubmission.update({
      where: { id: labReportSubmissionId },
      data: { status: 'FAILED', attempts: 3, lastError: 'Encounter not reported to SATUSEHAT' },
      select: { labOrder: { select: { encounterId: true } } },
    });
    const encounterId = parked.labOrder?.encounterId;
    expect(encounterId).toBeDefined();

    const reopenedCount = await repository.requeueLabReportsForEncounter(encounterId as string);

    expect(reopenedCount).toBe(1);
    const row = await prisma.satusehatSubmission.findUniqueOrThrow({
      where: { id: labReportSubmissionId },
    });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(0);
  });

  it('refuses a second open report for one order, and allows one beside a sent report', async () => {
    const { labOrderId, labReportSubmissionId } = await seedOrderWithEncounter('SUBMITTED');

    await expect(
      prisma.satusehatSubmission.create({
        data: { kind: 'LAB_REPORT', labOrderId, status: 'PENDING' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // Settling the first frees the index: an amendment has to be reportable.
    await prisma.satusehatSubmission.update({
      where: { id: labReportSubmissionId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    const amendment = await prisma.satusehatSubmission.create({
      data: { kind: 'LAB_REPORT', labOrderId, status: 'PENDING' },
    });
    createdSubmissionIds.push(amendment.id);

    expect(amendment.id).toBeDefined();
  });

  it('refuses a row that carries the key of the other kind', async () => {
    const encounterId = createdEncounterIds[0];

    await expect(
      prisma.satusehatSubmission.create({
        data: { kind: 'LAB_REPORT', encounterId, labOrderId: createdLabOrderIds[0] },
      }),
    ).rejects.toThrow();
  });
});
