import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QueueNumberAllocatorRepository } from './queue-number-allocator.repository';
import { RegistrationFlowRepository } from './registration-flow.repository';

/**
 * P14-T05's enqueue rules against real PostgreSQL.
 *
 * These live here rather than in a unit spec because every one of them is a
 * decision made *inside* a transaction against rows in three tables — the
 * config singleton, the appointment's provenance column, and the outbox's
 * `(registrationId, type)` unique key. Mocking Prisma would prove only that
 * the code calls the functions it calls.
 *
 * The case that matters most is the provenance skip. A Mobile JKN booking is
 * already BPJS's own queue entry; publishing it back with `antrean/add` hands
 * the member a second number for one visit, on the phone they are holding.
 *
 * A far-future queue date keeps a shared dev database's live counters
 * untouched; everything created is removed in `afterAll`.
 */
describe('Antrean outbox enqueue against PostgreSQL', () => {
  const queueDate = new Date('2099-04-01T00:00:00.000Z');
  const suffix = randomUUID();

  let prisma: PrismaService;
  let repository: RegistrationFlowRepository;

  let poliId: string;
  let doctorId: string;
  let actorUserId: string;
  let antreanConfigId: string | null = null;
  const patientIds: string[] = [];
  const appointmentIds: string[] = [];
  const registrationIds: string[] = [];

  /** A patient with a BPJS number, which the enqueue hooks require. */
  async function createInsuredPatient(): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `ANTOUT-${randomUUID()}`,
        fullName: 'Antrean Outbox Patient',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        phoneNumber: '+6280000000000',
        address: 'Test address',
        // The hooks only check for presence of the sealed column, never
        // decrypt it, so an opaque value is enough here.
        bpjsNumberCiphertext: `ciphertext-${randomUUID()}`,
      },
      select: { id: true },
    });
    patientIds.push(patient.id);
    return patient.id;
  }

  async function createAppointment(
    patientId: string,
    bpjsBookingCode: string | null,
  ): Promise<string> {
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        type: 'SPECIAL_REQUEST',
        scheduledAt: queueDate,
        bpjsBookingCode,
      },
      select: { id: true },
    });
    appointmentIds.push(appointment.id);
    return appointment.id;
  }

  async function registerAndCheckIn(appointmentId?: string): Promise<string> {
    const patientId = await createInsuredPatient();
    const created = await repository.createRegistration({
      patientId,
      appointmentId,
      createdById: actorUserId,
      actorUserId,
      queueDate,
    });
    registrationIds.push(created.id);
    await repository.updateRegistration({
      id: created.id,
      status: 'CHECKED_IN',
      checkedInAt: new Date(),
    });
    return created.id;
  }

  async function findOutboxTypes(registrationId: string): Promise<string[]> {
    const rows = await prisma.bpjsSubmission.findMany({
      where: { registrationId },
      select: { type: true },
    });
    return rows.map((row) => row.type).sort();
  }

  async function enableAntreanBridging(): Promise<void> {
    const created = await prisma.bpjsAntreanConfig.create({
      data: {
        environment: 'DEVELOPMENT',
        consId: 'test-cons',
        kdProviderPpk: 'test-ppk',
        secretKeyCiphertext: 'ciphertext',
        secretKeyLast4: 'aaaa',
        userKeyCiphertext: 'ciphertext',
        userKeyLast4: 'bbbb',
        isActive: true,
      },
      select: { id: true },
    });
    antreanConfigId = created.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const privacyNoticeRepositoryStub = {
      assertCurrentEvidenceOrCapture: async () => undefined,
    } as unknown as PrivacyNoticeRepository;
    repository = new RegistrationFlowRepository(
      prisma,
      new QueueNumberAllocatorRepository(),
      privacyNoticeRepositoryStub,
    );

    const poli = await prisma.specialty.create({
      data: { name: `Poli Antrean Outbox ${suffix}` },
      select: { id: true },
    });
    poliId = poli.id;
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `ANTOUT-${randomUUID()}`,
        fullName: 'Antrean Outbox Doctor',
        specialtyId: poliId,
      },
      select: { id: true },
    });
    doctorId = doctor.id;
    const actor = await prisma.user.create({
      data: { email: `antrean-outbox-${suffix}@example.com`, passwordHash: 'test-only' },
      select: { id: true },
    });
    actorUserId = actor.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.bpjsSubmission.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.poliQueueCounter.deleteMany({ where: { queueDate } });
    await prisma.queueCounter.deleteMany({ where: { queueDate } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.delete({ where: { id: doctorId } });
    await prisma.user.delete({ where: { id: actorUserId } });
    await prisma.specialty.delete({ where: { id: poliId } });
    if (antreanConfigId !== null) {
      await prisma.bpjsAntreanConfig.delete({ where: { id: antreanConfigId } });
    }
    await prisma.$disconnect();
  });

  describe('with no antrean configuration', () => {
    it('enqueues nothing for antrean', async () => {
      // A clinic running PCare bridging with no antrean credentials must not
      // accumulate rows for an integration it cannot send.
      const registrationId = await registerAndCheckIn();

      const actualTypes = await findOutboxTypes(registrationId);

      expect(actualTypes).not.toContain('ANTREAN_ADD');
    });
  });

  describe('with antrean bridging enabled', () => {
    beforeAll(async () => {
      await enableAntreanBridging();
    });

    it('enqueues antrean/add for a walk-in', async () => {
      const appointmentId = await createAppointment(await createInsuredPatient(), null);
      const registrationId = await registerAndCheckIn(appointmentId);

      const actualTypes = await findOutboxTypes(registrationId);

      expect(actualTypes).toContain('ANTREAN_ADD');
    });

    it('skips a Mobile JKN booking, which BPJS already holds', async () => {
      // The provenance rule. Republishing would put a second queue number on
      // the member's phone for a single visit.
      const appointmentId = await createAppointment(
        await createInsuredPatient(),
        `BOOKING-${randomUUID()}`,
      );
      const registrationId = await registerAndCheckIn(appointmentId);

      const actualTypes = await findOutboxTypes(registrationId);

      expect(actualTypes).not.toContain('ANTREAN_ADD');
      // Only the antrean row is asserted. Whether the PCare claim goes out
      // depends on an active `BpjsPcareConfig`, which this spec deliberately
      // does not create — a shared dev database may already hold the singleton
      // row, and the PCare enqueue has its own coverage. The independence of
      // the two integrations is a wiring fact, not something to prove by
      // mutating another integration's configuration.
    });

    it('does not cancel a queue entry BPJS never received', async () => {
      // ANTREAN_ADD is still PENDING here, so the add itself will refuse a
      // cancelled registration; asking BPJS to cancel nothing would only
      // produce a confusing FAILED row on the monitor.
      const appointmentId = await createAppointment(await createInsuredPatient(), null);
      const registrationId = await registerAndCheckIn(appointmentId);

      await repository.updateRegistration({ id: registrationId, status: 'CANCELLED' });

      expect(await findOutboxTypes(registrationId)).not.toContain('ANTREAN_BATAL');
    });

    it('cancels a queue entry BPJS did receive', async () => {
      const appointmentId = await createAppointment(await createInsuredPatient(), null);
      const registrationId = await registerAndCheckIn(appointmentId);
      await prisma.bpjsSubmission.update({
        where: { registrationId_type: { registrationId, type: 'ANTREAN_ADD' } },
        data: { status: 'SUBMITTED', submittedKdPoli: '001' },
      });

      await repository.updateRegistration({ id: registrationId, status: 'CANCELLED' });

      expect(await findOutboxTypes(registrationId)).toContain('ANTREAN_BATAL');
    });

    it('is idempotent across repeated check-ins', async () => {
      // The upsert is what makes a re-checked-in registration safe; a second
      // row would be a second queue entry for the same visit.
      const appointmentId = await createAppointment(await createInsuredPatient(), null);
      const registrationId = await registerAndCheckIn(appointmentId);

      await repository.updateRegistration({
        id: registrationId,
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      });

      const actualAddRows = await prisma.bpjsSubmission.count({
        where: { registrationId, type: 'ANTREAN_ADD' },
      });
      expect(actualAddRows).toBe(1);
    });
  });
});
