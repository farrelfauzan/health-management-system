import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AdmissionFlowRepository } from '../admission-flow/repository/admission-flow.repository';
import { EncounterRepository } from '../emr/repository/encounter.repository';

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
 */
describe('SATUSEHAT submission outbox against Postgres', () => {
  let prisma: PrismaService;
  let encounterRepository: EncounterRepository;
  let admissionRepository: AdmissionFlowRepository;

  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdAdmissionIds: string[] = [];
  let specialtyId: string;
  let wardId: string;
  let roomClassId: string;
  let roomId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    encounterRepository = new EncounterRepository(prisma);
    admissionRepository = new AdmissionFlowRepository(prisma);
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
      where: { encounterId: { in: createdEncounterIds } },
    });
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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
    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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

    const actualSubmission = await prisma.satusehatSubmission.findUnique({
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
    const actualSubmission = await prisma.satusehatSubmission.findUnique({
      where: { encounterId },
    });
    expect(actualEncounter?.status).toBe('IN_PROGRESS');
    expect(actualSubmission).toBeNull();
  });
});
