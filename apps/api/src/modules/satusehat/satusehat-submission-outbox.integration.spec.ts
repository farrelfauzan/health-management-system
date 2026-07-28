import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EncounterRepository } from '../emr/repository/encounter.repository';

/**
 * The outbox guarantee no unit test can prove: a FINISHED close and its
 * SATUSEHAT submission row commit in one transaction against real Postgres —
 * a closed visit can never silently miss the reporting queue, and a cancelled
 * one never enters it.
 */
describe('SATUSEHAT submission outbox against Postgres', () => {
  let prisma: PrismaService;
  let encounterRepository: EncounterRepository;

  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdEncounterIds: string[] = [];
  let specialtyId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    encounterRepository = new EncounterRepository(prisma);
    const specialty = await prisma.specialty.create({
      data: { name: `Outbox Spec ${randomUUID()}` },
    });
    specialtyId = specialty.id;
  });

  afterAll(async () => {
    await prisma.satusehatSubmission.deleteMany({
      where: { encounterId: { in: createdEncounterIds } },
    });
    await prisma.encounter.deleteMany({ where: { id: { in: createdEncounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: createdDoctorIds } } });
    await prisma.specialty.delete({ where: { id: specialtyId } });
    await prisma.$disconnect();
  });

  async function createOpenEncounter(): Promise<{ encounterId: string; registrationId: string }> {
    const patient = await prisma.patientProfile.create({
      data: {
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
    return { encounterId: encounter.id, registrationId: registration.id };
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
