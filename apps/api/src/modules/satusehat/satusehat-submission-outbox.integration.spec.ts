import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AdmissionFlowRepository } from '../admission-flow/repository/admission-flow.repository';
import { EncounterRepository } from '../emr/repository/encounter.repository';
import { LabResultRepository } from '../laboratory/repository/lab-result.repository';

/**
 * The outbox guarantee no unit test can prove: a FINISHED close and its
 * SATUSEHAT submission row commit in one transaction against real Postgres —
 * a closed visit can never silently miss the reporting queue, and a cancelled
 * one never enters it.
 *
 * Since P10-T09 the queue has two producers. An encounter whose patient is
 * still in a bed enqueues nothing at close: its Encounter is reported as
 * `class: IMP` over admission-to-discharge, and neither is known until the
 * patient leaves. For those the row is written inside the discharge
 * transaction instead, which is what the second half of this suite pins.
 *
 * Since P18-T09 there is a third producer with the same guarantee: releasing
 * a lab order writes a LAB_REPORT row in the release transaction, so a
 * released result can never silently miss the national record, and an
 * amendment enqueues again rather than editing what was already sent.
 */
describe('SATUSEHAT submission outbox against Postgres', () => {
  let prisma: PrismaService;
  let encounterRepository: EncounterRepository;
  let admissionRepository: AdmissionFlowRepository;
  let labResultRepository: LabResultRepository;

  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdAdmissionIds: string[] = [];
  const createdLabOrderIds: string[] = [];
  const createdUserIds: string[] = [];
  let createdLabTestId: string | null = null;
  let specialtyId: string;
  let wardId: string;
  let roomClassId: string;
  let roomId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    encounterRepository = new EncounterRepository(prisma);
    admissionRepository = new AdmissionFlowRepository(prisma);
    labResultRepository = new LabResultRepository(prisma);
    const specialty = await prisma.specialty.create({
      data: { name: `Outbox Spec ${randomUUID()}` },
    });
    specialtyId = specialty.id;
    const ward = await prisma.ward.create({
      data: { code: `OBW-${randomUUID().slice(0, 8)}`, name: 'Outbox Ward' },
    });
    wardId = ward.id;
    const roomClass = await prisma.roomClass.create({
      data: { code: `OBC-${randomUUID().slice(0, 8)}`, name: 'Outbox Class' },
    });
    roomClassId = roomClass.id;
    const room = await prisma.room.create({
      data: { wardId, roomClassId, code: `OBR-${randomUUID().slice(0, 8)}`, name: 'Outbox Room' },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.satusehatSubmission.deleteMany({
      where: {
        OR: [
          { encounterId: { in: createdEncounterIds } },
          { labOrderId: { in: createdLabOrderIds } },
        ],
      },
    });
    await prisma.labResult.deleteMany({
      where: { labOrderItem: { labOrderId: { in: createdLabOrderIds } } },
    });
    await prisma.labOrderItem.deleteMany({ where: { labOrderId: { in: createdLabOrderIds } } });
    await prisma.labOrder.deleteMany({ where: { id: { in: createdLabOrderIds } } });
    if (createdLabTestId) {
      await prisma.labTest.delete({ where: { id: createdLabTestId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.bedAssignment.deleteMany({
      where: { admissionId: { in: createdAdmissionIds } },
    });
    await prisma.admission.deleteMany({ where: { id: { in: createdAdmissionIds } } });
    await prisma.bed.deleteMany({ where: { roomId } });
    await prisma.room.delete({ where: { id: roomId } });
    await prisma.roomClass.delete({ where: { id: roomClassId } });
    await prisma.ward.delete({ where: { id: wardId } });
    await prisma.encounter.deleteMany({ where: { id: { in: createdEncounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: createdDoctorIds } } });
    await prisma.specialty.delete({ where: { id: specialtyId } });
    await prisma.$disconnect();
  });

  async function createOpenEncounter(): Promise<{
    encounterId: string;
    registrationId: string;
    patientId: string;
    doctorId: string;
  }> {
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `OUTBOX-${randomUUID().slice(0, 18)}`,
        fullName: 'Outbox Spec Patient',
        dateOfBirth: new Date('1990-01-01'),
        phoneNumber: '0800000000',
        address: 'Jl. Integrasi 1',
      },
    });
    createdPatientIds.push(patient.id);
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `OUTBOX-${randomUUID().slice(0, 18)}`,
        fullName: 'dr. Outbox Spec',
        specialtyId,
      },
    });
    createdDoctorIds.push(doctor.id);
    const registration = await prisma.registration.create({
      data: {
        patientId: patient.id,
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
    });
    createdRegistrationIds.push(registration.id);
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: registration.id,
        patientId: patient.id,
        doctorId: doctor.id,
        status: 'IN_PROGRESS',
      },
    });
    createdEncounterIds.push(encounter.id);
    return {
      encounterId: encounter.id,
      registrationId: registration.id,
      patientId: patient.id,
      doctorId: doctor.id,
    };
  }

  async function admitFromEncounter(context: {
    encounterId: string;
    patientId: string;
    doctorId: string;
  }): Promise<{ admissionId: string; assignmentId: string; bedId: string }> {
    const bed = await prisma.bed.create({
      data: { roomId, code: `OBB-${randomUUID().slice(0, 8)}`, status: 'OCCUPIED' },
    });
    const admission = await prisma.admission.create({
      data: {
        patientId: context.patientId,
        admittingDoctorId: context.doctorId,
        sourceEncounterId: context.encounterId,
        status: 'ADMITTED',
        admittedAt: new Date(),
      },
    });
    createdAdmissionIds.push(admission.id);
    const assignment = await prisma.bedAssignment.create({
      data: { admissionId: admission.id, bedId: bed.id, startedAt: new Date() },
    });
    return { admissionId: admission.id, assignmentId: assignment.id, bedId: bed.id };
  }

  it('creates the PENDING outbox row in the same transaction as a FINISHED close', async () => {
    const { encounterId, registrationId } = await createOpenEncounter();

    await encounterRepository.closeEncounter({
      id: encounterId,
      registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId },
    });
    expect(actualSubmission).not.toBeNull();
    expect(actualSubmission?.status).toBe('PENDING');
    expect(actualSubmission?.attempts).toBe(0);
    expect(actualSubmission?.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('enqueues nothing when the encounter closes with the patient still in a bed', async () => {
    const context = await createOpenEncounter();
    await admitFromEncounter(context);

    await encounterRepository.closeEncounter({
      id: context.encounterId,
      registrationId: context.registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId: context.encounterId },
    });
    expect(actualSubmission).toBeNull();
  });

  it('enqueues the row inside the discharge transaction', async () => {
    const context = await createOpenEncounter();
    const stay = await admitFromEncounter(context);
    await encounterRepository.closeEncounter({
      id: context.encounterId,
      registrationId: context.registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    await admissionRepository.dischargeAdmission({
      admissionId: stay.admissionId,
      currentAssignmentId: stay.assignmentId,
      currentBedId: stay.bedId,
      dischargedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId: context.encounterId },
    });
    expect(actualSubmission).not.toBeNull();
    expect(actualSubmission?.status).toBe('PENDING');
  });

  it('enqueues nothing on discharge while the encounter is still open', async () => {
    const context = await createOpenEncounter();
    const stay = await admitFromEncounter(context);

    await admissionRepository.dischargeAdmission({
      admissionId: stay.admissionId,
      currentAssignmentId: stay.assignmentId,
      currentBedId: stay.bedId,
      dischargedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId: context.encounterId },
    });
    expect(actualSubmission).toBeNull();
  });

  it('enqueues at close when the patient was already discharged — the late-paperwork case', async () => {
    const context = await createOpenEncounter();
    const stay = await admitFromEncounter(context);
    await admissionRepository.dischargeAdmission({
      admissionId: stay.admissionId,
      currentAssignmentId: stay.assignmentId,
      currentBedId: stay.bedId,
      dischargedAt: new Date(),
    });

    await encounterRepository.closeEncounter({
      id: context.encounterId,
      registrationId: context.registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId: context.encounterId },
    });
    expect(actualSubmission).not.toBeNull();
  });

  it('treats a cancelled admission as an outpatient visit', async () => {
    const context = await createOpenEncounter();
    const stay = await admitFromEncounter(context);
    await prisma.admission.update({
      where: { id: stay.admissionId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await encounterRepository.closeEncounter({
      id: context.encounterId,
      registrationId: context.registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId: context.encounterId },
    });
    expect(actualSubmission).not.toBeNull();
  });

  it('rolls the discharge back together with the outbox row when the transaction fails', async () => {
    const context = await createOpenEncounter();
    const stay = await admitFromEncounter(context);
    await encounterRepository.closeEncounter({
      id: context.encounterId,
      registrationId: context.registrationId,
      status: 'FINISHED',
      registrationStatus: 'COMPLETED',
      endedAt: new Date(),
    });

    // A discharge naming an assignment that does not exist fails inside the
    // transaction; the admission update and the outbox insert must vanish with
    // it, exactly as they do on the close path.
    await expect(
      admissionRepository.dischargeAdmission({
        admissionId: stay.admissionId,
        currentAssignmentId: randomUUID(),
        currentBedId: stay.bedId,
        dischargedAt: new Date(),
      }),
    ).rejects.toThrow();

    const actualAdmission = await prisma.admission.findUnique({ where: { id: stay.admissionId } });
    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId: context.encounterId },
    });
    expect(actualAdmission?.status).toBe('ADMITTED');
    expect(actualSubmission).toBeNull();
  });

  it('creates no outbox row for a cancelled encounter', async () => {
    const { encounterId, registrationId } = await createOpenEncounter();

    await encounterRepository.closeEncounter({
      id: encounterId,
      registrationId,
      status: 'CANCELLED',
      registrationStatus: 'CANCELLED',
      endedAt: new Date(),
    });

    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId },
    });
    expect(actualSubmission).toBeNull();
  });

  it('rolls the close back together with the outbox row when the transaction fails', async () => {
    const { encounterId } = await createOpenEncounter();

    // A close naming a registration that does not exist fails inside the
    // transaction after nothing has committed; both the encounter update and
    // the outbox insert must vanish with it.
    await expect(
      encounterRepository.closeEncounter({
        id: encounterId,
        registrationId: randomUUID(),
        status: 'FINISHED',
        registrationStatus: 'COMPLETED',
        endedAt: new Date(),
      }),
    ).rejects.toThrow();

    const actualEncounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
    const actualSubmission = await prisma.satusehatSubmission.findFirst({
      where: { encounterId },
    });
    expect(actualEncounter?.status).toBe('IN_PROGRESS');
    expect(actualSubmission).toBeNull();
  });
  describe('lab report producer', () => {
    async function createReleasableLabOrder(): Promise<{
      labOrderId: string;
      labOrderItemId: string;
      labResultId: string;
      userId: string;
    }> {
      const context = await createOpenEncounter();
      if (createdLabTestId === null) {
        const labTest = await prisma.labTest.create({
          data: {
            code: `OBX-${randomUUID().slice(0, 12)}`,
            name: 'Outbox Glucose',
            loincCode: `9${randomUUID().replace(/\D/g, '').slice(0, 5).padEnd(5, '0')}-7`,
            specimenType: 'SERUM',
            resultType: 'NUMERIC',
            unit: 'mg/dL',
          },
        });
        createdLabTestId = labTest.id;
      }
      const analyst = await prisma.user.create({
        data: {
          email: `outbox-analyst-${randomUUID()}@hms.local`,
          passwordHash: 'unusable',
        },
      });
      createdUserIds.push(analyst.id);
      const labOrder = await prisma.labOrder.create({
        data: {
          encounterId: context.encounterId,
          patientId: context.patientId,
          orderedById: context.doctorId,
          orderNumber: `LAB/OUTBOX/${randomUUID()}`,
          status: 'RESULTED',
          items: { create: [{ labTestId: createdLabTestId }] },
        },
        include: { items: true },
      });
      createdLabOrderIds.push(labOrder.id);
      const labOrderItemId = labOrder.items[0]?.id as string;
      const labResult = await prisma.labResult.create({
        data: {
          labOrderItemId,
          version: 1,
          valueNumeric: 142,
          unit: 'mg/dL',
          enteredById: analyst.id,
          enteredAt: new Date(),
        },
      });
      return {
        labOrderId: labOrder.id,
        labOrderItemId,
        labResultId: labResult.id,
        userId: analyst.id,
      };
    }

    it('writes a LAB_REPORT row in the same transaction that releases the order', async () => {
      const { labOrderId, userId } = await createReleasableLabOrder();

      await labResultRepository.releaseLabOrder({
        labOrderId,
        verifiedById: userId,
        verifiedAt: new Date(),
        verifiedUnderSingleOperator: false,
      });

      const rows = await prisma.satusehatSubmission.findMany({ where: { labOrderId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.kind).toBe('LAB_REPORT');
      expect(rows[0]?.status).toBe('PENDING');
      // Keyed on the order, never on the encounter: the report reaches its
      // visit through the order, which is what lets P18-T10 drop the visit.
      expect(rows[0]?.encounterId).toBeNull();
    });

    it('does not queue a second row while the first is still unsent', async () => {
      const { labOrderId, userId } = await createReleasableLabOrder();
      const releasePayload = {
        labOrderId,
        verifiedById: userId,
        verifiedAt: new Date(),
        verifiedUnderSingleOperator: false,
      };

      await labResultRepository.releaseLabOrder(releasePayload);
      await labResultRepository.releaseLabOrder(releasePayload);

      const rows = await prisma.satusehatSubmission.findMany({ where: { labOrderId } });
      expect(rows).toHaveLength(1);
    });

    it('queues an amendment beside a report the platform already accepted', async () => {
      const { labOrderId, labOrderItemId, labResultId, userId } = await createReleasableLabOrder();
      await labResultRepository.releaseLabOrder({
        labOrderId,
        verifiedById: userId,
        verifiedAt: new Date(),
        verifiedUnderSingleOperator: false,
      });
      await prisma.satusehatSubmission.updateMany({
        where: { labOrderId },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });

      await labResultRepository.amendLabResult({
        labOrderId,
        labOrderItemId,
        version: 2,
        valueNumeric: 99,
        valueText: null,
        valueCoded: null,
        unit: 'mg/dL',
        refLow: null,
        refHigh: null,
        refCriticalLow: null,
        refCriticalHigh: null,
        refText: null,
        flag: null,
        enteredById: userId,
        enteredAt: new Date(),
        verifiedById: userId,
        verifiedAt: new Date(),
        verifiedUnderSingleOperator: false,
        amendedFromId: labResultId,
        amendReason: 'Transcription error',
      });

      const rows = await prisma.satusehatSubmission.findMany({
        where: { labOrderId },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.status)).toEqual(['SUBMITTED', 'PENDING']);
    });
  });
});
