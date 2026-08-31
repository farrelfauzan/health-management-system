import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProspectivePatientRepository } from './repository/prospective-patient.repository';
import { ProspectivePatientExpiryWorker } from './service/prospective-patient-expiry.worker';

const DAY_IN_MS = 86_400_000;

/**
 * The `P17-T06` guarantees that only hold against a real foreign key.
 *
 * The unit suite proves the worker asks the right questions of a mock. What it
 * cannot prove is the thing that makes this job hard: `Appointment` references
 * `ProspectivePatient` with `ON DELETE RESTRICT`, so "delete the record" is a
 * statement the database is entitled to refuse. Three facts follow from that
 * and all three need a database:
 *
 * **A record with a live booking survives.** Somebody who booked four months
 * ahead is past their retention date and has still not arrived *yet*; deleting
 * them drops the subject of a booking the front desk is expecting.
 *
 * **A record whose bookings are all cancelled goes, and takes them with it.**
 * Otherwise one cancelled booking pins a stranger's name and phone number in
 * the table forever — the exact outcome the retention rule exists to prevent.
 *
 * **Running twice is a no-op.** A sweep is a scheduled job; if the second run
 * is not free, every deployment restart is a risk.
 *
 * Rows are namespaced by a fixed marker and removed around each run so a shared
 * dev database is never left with test residue.
 */
describe('prospective patient expiry sweep against Postgres', () => {
  const TEST_MARKER = 'p17-t06-spec';

  let prisma: PrismaService;
  let repository: ProspectivePatientRepository;
  let worker: ProspectivePatientExpiryWorker;
  let auditRecordMock: jest.Mock;
  let doctorId: string;

  async function createProspective(params: {
    suffix: string;
    /** Negative means already past its retention date. */
    expiresInDays: number;
  }): Promise<string> {
    const prospective = await prisma.prospectivePatient.create({
      data: {
        fullName: `${TEST_MARKER} ${params.suffix}`,
        phoneNumber: '628121000006',
        channel: 'TELEGRAM',
        externalChatId: `${TEST_MARKER}-${params.suffix}`,
        expiresAt: new Date(Date.now() + params.expiresInDays * DAY_IN_MS),
      },
      select: { id: true },
    });
    return prospective.id;
  }

  async function createBooking(params: {
    prospectivePatientId: string;
    suffix: string;
    status?: 'SCHEDULED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED';
    scheduledAt?: Date;
  }): Promise<string> {
    const appointment = await prisma.appointment.create({
      data: {
        prospectivePatientId: params.prospectivePatientId,
        doctorId,
        type: 'SESSION',
        scheduledAt: params.scheduledAt ?? new Date(Date.now() + 30 * DAY_IN_MS),
        status: params.status ?? 'SCHEDULED',
        bookingSource: 'TELEGRAM',
        bookingReferenceCode: `${TEST_MARKER}-${params.suffix}`,
      },
      select: { id: true },
    });
    return appointment.id;
  }

  /**
   * Per-test rows only. The doctor and specialty are built once and outlive
   * every case: deleting them between tests would take the foreign key each
   * booking needs with them.
   */
  async function deleteCaseRows(): Promise<void> {
    await prisma.appointment.deleteMany({
      where: { bookingReferenceCode: { startsWith: TEST_MARKER } },
    });
    await prisma.prospectivePatient.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
  }

  async function deleteAllTestRows(): Promise<void> {
    await deleteCaseRows();
    await prisma.doctorProfile.deleteMany({ where: { licenseNumber: { startsWith: TEST_MARKER } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    await deleteAllTestRows();

    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Umum` },
      select: { id: true },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-license`,
        fullName: `${TEST_MARKER} dokter`,
        specialtyId: specialty.id,
      },
      select: { id: true },
    });
    doctorId = doctor.id;

    repository = new ProspectivePatientRepository(prisma);
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    auditRecordMock = jest.fn().mockResolvedValue(undefined);
    worker = new ProspectivePatientExpiryWorker(
      new ConfigService(),
      repository,
      { record: auditRecordMock } as unknown as AuditService,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await deleteCaseRows();
  });

  afterAll(async () => {
    await deleteAllTestRows();
    await prisma.$disconnect();
  });

  it('purges an overdue record with no booking at all', async () => {
    const prospectiveId = await createProspective({ suffix: 'inert', expiresInDays: -1 });

    const result = await worker.sweepOnce();

    expect(result).toMatchObject({ purged: expect.any(Number) });
    expect(
      await prisma.prospectivePatient.findUnique({ where: { id: prospectiveId } }),
    ).toBeNull();
  });

  it('leaves an overdue record whose booking is still live', async () => {
    const prospectiveId = await createProspective({ suffix: 'expected', expiresInDays: -30 });
    const appointmentId = await createBooking({
      prospectivePatientId: prospectiveId,
      suffix: 'expected',
    });

    await worker.sweepOnce();

    // Past its date and still kept: the person has not arrived *yet*, and the
    // front desk is expecting them next month.
    const record = await prisma.prospectivePatient.findUniqueOrThrow({
      where: { id: prospectiveId },
      select: { status: true },
    });
    // Not even marked EXPIRED — a booking pointing at an expired subject is a
    // worklist row nobody can act on.
    expect(record.status).toBe('AWAITING_ARRIVAL');
    expect(
      await prisma.appointment.findUnique({ where: { id: appointmentId } }),
    ).not.toBeNull();
  });

  it('purges an overdue record whose bookings were all cancelled, and deletes them with it', async () => {
    const prospectiveId = await createProspective({ suffix: 'cancelled', expiresInDays: -1 });
    const appointmentId = await createBooking({
      prospectivePatientId: prospectiveId,
      suffix: 'cancelled',
      status: 'CANCELLED',
    });

    await worker.sweepOnce();

    // The appointment goes too, and it has to: ON DELETE RESTRICT means one
    // cancelled booking would otherwise pin this person's name and phone
    // number in the table forever.
    expect(
      await prisma.prospectivePatient.findUnique({ where: { id: prospectiveId } }),
    ).toBeNull();
    expect(await prisma.appointment.findUnique({ where: { id: appointmentId } })).toBeNull();
  });

  it('keeps a record whose booking was completed', async () => {
    const prospectiveId = await createProspective({ suffix: 'completed', expiresInDays: -1 });
    await createBooking({
      prospectivePatientId: prospectiveId,
      suffix: 'completed',
      status: 'COMPLETED',
      scheduledAt: new Date(Date.now() - 10 * DAY_IN_MS),
    });

    await worker.sweepOnce();

    // Somebody was seen without ever being registered. That is a data-quality
    // problem for a human, not a row for a background job to delete.
    expect(
      await prisma.prospectivePatient.findUnique({ where: { id: prospectiveId } }),
    ).not.toBeNull();
  });

  it('never touches a record that resolved to a patient, however old', async () => {
    const prospectiveId = await createProspective({ suffix: 'converted', expiresInDays: -400 });
    await prisma.prospectivePatient.update({
      where: { id: prospectiveId },
      // `converted_at` comes with the status: the table's resolution CHECK
      // refuses a CONVERTED row without one.
      data: { status: 'CONVERTED', convertedAt: new Date() },
    });

    await worker.sweepOnce();

    // It is the provenance of a real patient's first contact with the clinic,
    // and what makes a repeat booking from that number find them again.
    const record = await prisma.prospectivePatient.findUniqueOrThrow({
      where: { id: prospectiveId },
      select: { status: true },
    });
    expect(record.status).toBe('CONVERTED');
  });

  it('leaves a record that has not reached its date', async () => {
    const prospectiveId = await createProspective({ suffix: 'fresh', expiresInDays: 30 });

    await worker.sweepOnce();

    expect(
      await prisma.prospectivePatient.findUnique({ where: { id: prospectiveId } }),
    ).not.toBeNull();
  });

  it('is idempotent — a second run finds nothing and writes no audit row', async () => {
    await createProspective({ suffix: 'twice', expiresInDays: -1 });

    const firstRun = await worker.sweepOnce();
    auditRecordMock.mockClear();
    const secondRun = await worker.sweepOnce();

    expect(firstRun.purged).toBeGreaterThanOrEqual(1);
    expect(secondRun).toEqual({ purged: 0, skipped: 0 });
    // A sweep is a scheduled job. If the second run is not free, every
    // deployment restart is a risk.
    expect(auditRecordMock).not.toHaveBeenCalled();
  });

  it('audits the run with counts and no record id', async () => {
    await createProspective({ suffix: 'audit-inert', expiresInDays: -1 });
    const expectedId = await createProspective({ suffix: 'audit-kept', expiresInDays: -1 });
    await createBooking({ prospectivePatientId: expectedId, suffix: 'audit-kept' });

    await worker.sweepOnce();

    const audited = auditRecordMock.mock.calls.at(-1)?.[0];
    expect(audited).toMatchObject({ action: 'DELETE', resource: 'ProspectivePatient' });
    expect(audited.metadata.purged).toBeGreaterThanOrEqual(1);
    expect(audited.metadata.skipped).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audited)).not.toContain(expectedId);
  });
});
