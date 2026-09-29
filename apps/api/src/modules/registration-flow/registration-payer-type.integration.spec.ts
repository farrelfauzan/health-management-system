import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { PrivacyNoticeRepository } from '../../common/privacy-notice/privacy-notice.repository';
import { QueueNumberAllocatorRepository } from './repository/queue-number-allocator.repository';
import { RegistrationFlowRepository } from './repository/registration-flow.repository';

const MIGRATION_PATH = join(
  __dirname,
  '../../../prisma/migrations/20270107000000_registration_payer_type/migration.sql',
);
const QUEUE_DATE = new Date('2099-02-11T00:00:00.000Z');
const ROLLBACK = 'rollback-payer-backfill';

type PayerRow = { id: string; payerType: string | null };

/**
 * P29-T07 against a real PostgreSQL: the migration's backfill marks only visits
 * with a BPJS trace as BPJS, and a new registration from a Mobile JKN booking
 * is BPJS without being asked. The backfill runs inside a transaction that is
 * rolled back, so a shared database keeps its own rows as they were.
 */
describe('Registration payer type against PostgreSQL', () => {
  let prisma: PrismaService;
  let repository: RegistrationFlowRepository;
  const suffix = randomUUID().slice(0, 8);
  const specialtyId = randomUUID();
  const doctorId = randomUUID();
  const patientIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const bookedAppointmentId = randomUUID();
  const freshBookingId = randomUUID();
  const withKunjunganId = randomUUID();
  const withBookingId = randomUUID();
  const withoutTraceId = randomUUID();
  const alreadyGeneralId = randomUUID();
  const createdRegistrationIds: string[] = [];
  let actorUserId = '';

  function extractBackfill(): string {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    return sql.slice(sql.indexOf('UPDATE "registrations"'));
  }

  async function seedClinic(): Promise<void> {
    const actor = await prisma.user.create({
      data: {
        email: `payer-${suffix}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName: 'Payer Spec Desk',
      },
      select: { id: true },
    });
    actorUserId = actor.id;
    await prisma.specialty.create({ data: { id: specialtyId, name: `Poli payer ${suffix}` } });
    await prisma.doctorProfile.create({
      data: { id: doctorId, licenseNumber: `LIC-${suffix}`, fullName: 'dr. Payer', specialtyId },
    });
    await prisma.patientProfile.createMany({
      data: patientIds.map((id, index) => ({
        id,
        mrn: `MRN-${suffix}-${index}`,
        fullName: `Patient Payer ${index}`,
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE' as const,
        phoneNumber: '0800000000',
        address: 'Jl. Uji',
      })),
    });
    await prisma.appointment.createMany({
      data: [
        { id: bookedAppointmentId, bpjsBookingCode: `JKN-${suffix}-1` },
        { id: freshBookingId, bpjsBookingCode: `JKN-${suffix}-2` },
      ].map((appointment, index) => ({
        ...appointment,
        patientId: patientIds[index + 1] as string,
        doctorId,
        scheduledAt: new Date('2099-02-11T02:00:00.000Z'),
        status: 'SCHEDULED' as const,
      })),
    });
  }

  async function seedRegistrations(): Promise<void> {
    const rows = [
      { id: withKunjunganId, patientId: patientIds[0], appointmentId: null, payerType: null },
      {
        id: withBookingId,
        patientId: patientIds[1],
        appointmentId: bookedAppointmentId,
        payerType: null,
      },
      { id: withoutTraceId, patientId: patientIds[3], appointmentId: null, payerType: null },
      {
        id: alreadyGeneralId,
        patientId: patientIds[4],
        appointmentId: null,
        payerType: 'GENERAL' as const,
      },
    ];
    await prisma.registration.createMany({
      data: rows.map((row) => ({
        ...row,
        patientId: row.patientId as string,
        status: 'COMPLETED' as const,
      })),
    });
    await prisma.bpjsSubmission.createMany({
      data: [withKunjunganId, alreadyGeneralId].map((registrationId) => ({
        registrationId,
        type: 'KUNJUNGAN' as const,
      })),
    });
  }

  /** Runs the backfill, reads the four rows, then undoes everything. */
  async function readAfterBackfill(): Promise<PayerRow[]> {
    let rows: PayerRow[] = [];
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(extractBackfill());
        rows = await tx.registration.findMany({
          where: { id: { in: [withKunjunganId, withBookingId, withoutTraceId, alreadyGeneralId] } },
          select: { id: true, payerType: true },
        });
        throw new Error(ROLLBACK);
      })
      .catch((err: Error) => {
        if (err.message !== ROLLBACK) {
          throw err;
        }
      });
    return rows;
  }

  function findPayer(rows: PayerRow[], id: string): string | null | undefined {
    return rows.find((row) => row.id === id)?.payerType;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const privacyNoticeStub = { assertCurrentEvidenceOrCapture: jest.fn(async () => undefined) };
    repository = new RegistrationFlowRepository(
      prisma,
      new QueueNumberAllocatorRepository(),
      privacyNoticeStub as unknown as PrivacyNoticeRepository,
    );
    await seedClinic();
    await seedRegistrations();
  });

  afterAll(async () => {
    const registrationIds = [
      withKunjunganId,
      withBookingId,
      withoutTraceId,
      alreadyGeneralId,
      ...createdRegistrationIds,
    ];
    await prisma.bpjsSubmission.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.appointment.deleteMany({
      where: { id: { in: [bookedAppointmentId, freshBookingId] } },
    });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.queueCounter.deleteMany({ where: { queueDate: QUEUE_DATE } });
    await prisma.poliQueueCounter.deleteMany({ where: { queueDate: QUEUE_DATE } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await prisma.$disconnect();
  });

  it('given a registration with a BPJS KUNJUNGAN submission, after migrate it is BPJS', async () => {
    const rows = await readAfterBackfill();

    expect(findPayer(rows, withKunjunganId)).toBe('BPJS');
  });

  it('given a registration from a Mobile JKN booking, after migrate it is BPJS', async () => {
    const rows = await readAfterBackfill();

    expect(findPayer(rows, withBookingId)).toBe('BPJS');
  });

  it('given an old registration with no BPJS trace, it stays null and GENERAL is never guessed', async () => {
    const rows = await readAfterBackfill();

    expect(findPayer(rows, withoutTraceId)).toBeNull();
    expect(findPayer(rows, alreadyGeneralId)).toBe('GENERAL');
  });

  it('records a new registration from a Mobile JKN booking as BPJS without being asked', async () => {
    const created = await repository.createRegistration({
      patientId: patientIds[2] as string,
      appointmentId: freshBookingId,
      createdById: actorUserId,
      actorUserId,
      queueDate: QUEUE_DATE,
    });
    createdRegistrationIds.push(created.id);

    expect(created.payerType).toBe('BPJS');
  });
});
