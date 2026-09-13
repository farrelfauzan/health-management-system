import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SatusehatSubmissionRepository } from './repository/satusehat-submission.repository';

/**
 * What the resource list must do against real Postgres, which no unit test can
 * prove (P21-T02): the constraints that keep it honest are in the database, not
 * in TypeScript.
 *
 * Three of them matter. A SKIPPED row may not carry an id, because a skipped
 * item was never sent. A SENT row may not carry a skip reason, because the
 * monitor would render the contradiction as fact. And a retry that succeeds
 * must *replace* the previous attempt's list rather than add to it, or every
 * count the monitor shows doubles.
 */
describe('SATUSEHAT submission resource list against Postgres', () => {
  let prisma: PrismaService;
  let repository: SatusehatSubmissionRepository;

  const createdSubmissionIds: string[] = [];
  const createdLabOrderIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  let createdLabTestId: string | null = null;

  /**
   * A LAB_REPORT submission row, which needs only a lab order — an ENCOUNTER row
   * would drag in a doctor, a registration and a closed visit for a test about
   * the list, not about the outbox.
   */
  async function createSubmission(): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'MALE',
        mrn: `RLIST-${randomUUID().slice(0, 18)}`,
        fullName: 'Resource List Patient',
        dateOfBirth: new Date('1990-01-01'),
        phoneNumber: '0800000000',
        address: 'Jl. Integrasi 2',
      },
    });
    createdPatientIds.push(patient.id);
    const registration = await prisma.registration.create({
      data: {
        patientId: patient.id,
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
    });
    createdRegistrationIds.push(registration.id);
    if (createdLabTestId === null) {
      const labTest = await prisma.labTest.create({
        data: {
          code: `RLIST-${randomUUID().slice(0, 12)}`,
          name: 'Resource List Glucose',
          specimenType: 'SERUM',
          resultType: 'NUMERIC',
          unit: 'mg/dL',
        },
      });
      createdLabTestId = labTest.id;
    }
    const labOrder = await prisma.labOrder.create({
      data: {
        // WALK_IN, so the fixture needs neither an encounter nor an ordering
        // doctor: `lab_orders_source_keys_check` requires both for an ENCOUNTER
        // order, and this suite is about the resource list, not the visit.
        source: 'WALK_IN',
        patientId: patient.id,
        registrationId: registration.id,
        orderNumber: `RLIST-${randomUUID().slice(0, 12)}`,
        status: 'RELEASED',
        orderedAt: new Date(),
        releasedAt: new Date(),
      },
    });
    createdLabOrderIds.push(labOrder.id);
    const submission = await prisma.satusehatSubmission.create({
      data: {
        kind: 'LAB_REPORT',
        labOrderId: labOrder.id,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    createdSubmissionIds.push(submission.id);
    return submission.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new SatusehatSubmissionRepository(
      prisma,
      new NationalIdentifierCryptoService(new ConfigService()),
    );
  });

  afterAll(async () => {
    if (createdSubmissionIds.length > 0) {
      await prisma.satusehatSubmission.deleteMany({ where: { id: { in: createdSubmissionIds } } });
    }
    if (createdLabOrderIds.length > 0) {
      await prisma.labOrder.deleteMany({ where: { id: { in: createdLabOrderIds } } });
    }
    if (createdLabTestId !== null) {
      await prisma.labTest.deleteMany({ where: { id: createdLabTestId } });
    }
    if (createdRegistrationIds.length > 0) {
      await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
    }
    if (createdPatientIds.length > 0) {
      await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    await prisma.$disconnect();
  });

  it('persists what a submission sent and what it skipped', async () => {
    const submissionId = await createSubmission();

    await repository.saveSubmissionResources({
      submissionId,
      resources: [
        {
          resourceType: 'Encounter',
          outcome: 'SENT',
          skipReason: null,
          satusehatId: 'ihs-enc-1',
          localRecordId: null,
          isBackfilled: false,
        },
        {
          resourceType: 'Medication',
          outcome: 'SKIPPED',
          skipReason: 'NO_KFA_CODE',
          satusehatId: null,
          localRecordId: null,
          isBackfilled: false,
        },
      ],
    });

    const rows = await prisma.satusehatSubmissionResource.findMany({
      where: { submissionId },
      orderBy: { resourceType: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      resourceType: 'Encounter',
      outcome: 'SENT',
      skipReason: null,
      satusehatId: 'ihs-enc-1',
      isBackfilled: false,
    });
    expect(rows[1]).toMatchObject({
      resourceType: 'Medication',
      outcome: 'SKIPPED',
      skipReason: 'NO_KFA_CODE',
      satusehatId: null,
    });
  });

  it('replaces the previous attempt list, so a successful retry does not double every count', async () => {
    const submissionId = await createSubmission();
    await repository.saveSubmissionResources({
      submissionId,
      resources: [
        {
          resourceType: 'Encounter',
          outcome: 'SENT',
          skipReason: null,
          satusehatId: 'first-attempt',
          localRecordId: null,
          isBackfilled: false,
        },
      ],
    });

    await repository.saveSubmissionResources({
      submissionId,
      resources: [
        {
          resourceType: 'Encounter',
          outcome: 'SENT',
          skipReason: null,
          satusehatId: 'second-attempt',
          localRecordId: null,
          isBackfilled: false,
        },
      ],
    });

    const rows = await prisma.satusehatSubmissionResource.findMany({ where: { submissionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.satusehatId).toBe('second-attempt');
  });

  it('records a lab report that sent nothing as skips alone, not as a clean success', async () => {
    const submissionId = await createSubmission();

    await repository.saveSubmissionResources({
      submissionId,
      resources: [
        {
          resourceType: 'ServiceRequest',
          outcome: 'SKIPPED',
          skipReason: 'NO_LOINC_CODE',
          satusehatId: null,
          localRecordId: null,
          isBackfilled: false,
        },
      ],
    });

    const rows = await prisma.satusehatSubmissionResource.findMany({ where: { submissionId } });
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => row.outcome === 'SENT')).toBe(false);
  });

  it('refuses a skipped row that carries a SATUSEHAT id', async () => {
    const submissionId = await createSubmission();

    await expect(
      prisma.satusehatSubmissionResource.create({
        data: {
          submissionId,
          resourceType: 'Medication',
          outcome: 'SKIPPED',
          skipReason: 'NO_KFA_CODE',
          satusehatId: 'should-not-exist',
        },
      }),
    ).rejects.toThrow();
  });

  it('refuses a sent row that carries a skip reason', async () => {
    const submissionId = await createSubmission();

    await expect(
      prisma.satusehatSubmissionResource.create({
        data: {
          submissionId,
          resourceType: 'Condition',
          outcome: 'SENT',
          skipReason: 'NO_ICD9CM_CODE',
        },
      }),
    ).rejects.toThrow();
  });

  it('refuses a skipped row with no reason at all', async () => {
    const submissionId = await createSubmission();

    await expect(
      prisma.satusehatSubmissionResource.create({
        data: { submissionId, resourceType: 'Condition', outcome: 'SKIPPED' },
      }),
    ).rejects.toThrow();
  });

  it('takes the list with the submission when the row is deleted', async () => {
    const submissionId = await createSubmission();
    await repository.saveSubmissionResources({
      submissionId,
      resources: [
        {
          resourceType: 'Encounter',
          outcome: 'SENT',
          skipReason: null,
          satusehatId: 'ihs-enc-cascade',
          localRecordId: null,
          isBackfilled: false,
        },
      ],
    });

    await prisma.satusehatSubmission.delete({ where: { id: submissionId } });

    const rows = await prisma.satusehatSubmissionResource.findMany({ where: { submissionId } });
    expect(rows).toHaveLength(0);
  });
});
