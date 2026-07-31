import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QueueNumberAllocatorRepository } from './queue-number-allocator.repository';
import { RegistrationFlowRepository } from './registration-flow.repository';

/**
 * P14-T01 through the repository against real PostgreSQL, because the two
 * things worth proving here only exist in the database: that the clinic-wide
 * ticket and the poli ticket are written by the same transaction, and that the
 * pairing CHECK constraint (a poli number is meaningless without its poli)
 * actually rejects a half-written row.
 *
 * A far-future queue date keeps a shared dev database's live counters
 * untouched; everything created is removed in `afterAll`.
 */
describe('Per-poli queue numbering against PostgreSQL', () => {
  const queueDate = new Date('2099-03-01T00:00:00.000Z');
  const suffix = randomUUID();

  let prisma: PrismaService;
  let repository: RegistrationFlowRepository;

  let generalPoliId: string;
  let dentalPoliId: string;
  let generalDoctorId: string;
  let dentalDoctorId: string;
  let actorUserId: string;
  const patientIds: string[] = [];
  const appointmentIds: string[] = [];
  const registrationIds: string[] = [];

  async function createPatient(name: string): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `POLI-${randomUUID()}`,
        fullName: name,
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        phoneNumber: '+6280000000000',
        address: 'Test address',
      },
      select: { id: true },
    });
    patientIds.push(patient.id);
    return patient.id;
  }

  async function createAppointment(patientId: string, doctorId: string): Promise<string> {
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        type: 'SPECIAL_REQUEST',
        scheduledAt: queueDate,
      },
      select: { id: true },
    });
    appointmentIds.push(appointment.id);
    return appointment.id;
  }

  async function register(patientId: string, appointmentId?: string) {
    const created = await repository.createRegistration({
      patientId,
      appointmentId,
      createdById: actorUserId,
      actorUserId,
      queueDate,
    });
    registrationIds.push(created.id);
    return created;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    // The privacy-notice gate is stubbed rather than satisfied with real
    // evidence: notice records are append-only by database trigger, so
    // creating them here would leave rows this spec cannot clean up. The gate
    // has its own coverage; what is under test is the queue allocation.
    const privacyNoticeRepositoryStub = {
      assertCurrentEvidenceOrCapture: async () => undefined,
    } as unknown as PrivacyNoticeRepository;
    repository = new RegistrationFlowRepository(
      prisma,
      new QueueNumberAllocatorRepository(),
      privacyNoticeRepositoryStub,
    );

    const generalPoli = await prisma.specialty.create({
      data: { name: `Poli Umum ${suffix}` },
      select: { id: true },
    });
    const dentalPoli = await prisma.specialty.create({
      data: { name: `Poli Gigi ${suffix}` },
      select: { id: true },
    });
    generalPoliId = generalPoli.id;
    dentalPoliId = dentalPoli.id;

    const generalDoctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `POLI-${randomUUID()}`,
        fullName: 'Poli Umum Doctor',
        specialtyId: generalPoliId,
      },
      select: { id: true },
    });
    const dentalDoctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `POLI-${randomUUID()}`,
        fullName: 'Poli Gigi Doctor',
        specialtyId: dentalPoliId,
      },
      select: { id: true },
    });
    generalDoctorId = generalDoctor.id;
    dentalDoctorId = dentalDoctor.id;

    const actor = await prisma.user.create({
      data: { email: `poli-queue-${suffix}@example.com`, passwordHash: 'test-only' },
      select: { id: true },
    });
    actorUserId = actor.id;

    for (const name of ['Poli Patient One', 'Poli Patient Two', 'Poli Patient Three']) {
      await createPatient(name);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.poliQueueCounter.deleteMany({ where: { queueDate } });
    await prisma.queueCounter.deleteMany({ where: { queueDate } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({
      where: { id: { in: [generalDoctorId, dentalDoctorId] } },
    });
    await prisma.user.delete({ where: { id: actorUserId } });
    await prisma.specialty.deleteMany({ where: { id: { in: [generalPoliId, dentalPoliId] } } });
    await prisma.$disconnect();
  });

  it('issues both tickets in one transaction, each poli starting at 1', async () => {
    const [firstPatientId, secondPatientId] = patientIds;
    const generalAppointmentId = await createAppointment(firstPatientId!, generalDoctorId);
    const dentalAppointmentId = await createAppointment(secondPatientId!, dentalDoctorId);

    const actualGeneral = await register(firstPatientId!, generalAppointmentId);
    const actualDental = await register(secondPatientId!, dentalAppointmentId);

    // One clinic-wide roll shared by both, and a sequence per poli that the
    // other poli's traffic never advances.
    expect(actualGeneral.queueNumber).toBe(1);
    expect(actualGeneral.poliQueueNumber).toBe(1);
    expect(actualGeneral.specialtyId).toBe(generalPoliId);
    expect(actualDental.queueNumber).toBe(2);
    expect(actualDental.poliQueueNumber).toBe(1);
    expect(actualDental.specialtyId).toBe(dentalPoliId);
  });

  it('leaves the poli columns empty for a walk-in with no appointment', async () => {
    const walkInPatientId = patientIds[2];

    const actualWalkIn = await register(walkInPatientId!);

    expect(actualWalkIn.queueNumber).toBe(3);
    expect(actualWalkIn.poliQueueNumber).toBeNull();
    expect(actualWalkIn.specialtyId).toBeNull();
  });

  it('issues a fresh poli ticket when the appointment moves to another poli', async () => {
    const patientId = patientIds[0];
    const registrationId = registrationIds[0];
    const movedAppointmentId = await createAppointment(patientId!, dentalDoctorId);
    // The original appointment link must be free before it can be reassigned.
    await prisma.appointment.update({
      where: { id: appointmentIds[0]! },
      data: { status: 'CANCELLED' },
    });

    const actualMoved = await repository.updateRegistration({
      id: registrationId!,
      appointmentId: movedAppointmentId,
    });

    // Second ticket in the dental poli, and the abandoned Poli Umum number 1
    // stays a gap — the same thing a torn paper ticket does.
    expect(actualMoved.specialtyId).toBe(dentalPoliId);
    expect(actualMoved.poliQueueNumber).toBe(2);
    expect(actualMoved.queueNumber).toBe(1);
  });

  it('clears both poli columns when the appointment link is removed', async () => {
    const registrationId = registrationIds[0];

    const actualUnlinked = await repository.updateRegistration({
      id: registrationId!,
      appointmentId: null,
    });

    expect(actualUnlinked.specialtyId).toBeNull();
    expect(actualUnlinked.poliQueueNumber).toBeNull();
    expect(actualUnlinked.queueNumber).toBe(1);
  });

  it('rejects a poli number written without its poli', async () => {
    await expect(
      prisma.registration.update({
        where: { id: registrationIds[1]! },
        data: { specialtyId: null },
      }),
    ).rejects.toThrow(/registrations_poli_queue_pairing_check/);
  });
});
