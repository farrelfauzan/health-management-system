import { ConfigService } from '@nestjs/config';

import { CreatePatientInput } from '@hms/shared-types';

import { AuditService } from '../../common/audit/audit.service';
import { CurrentUser } from '../../common/auth/current-user.type';
import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { MrnAllocatorRepository } from '../../common/mrn/mrn-allocator.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrivacyNoticeRepository } from '../../common/privacy-notice/privacy-notice.repository';
import { AuthRepository } from '../auth/repository/auth.repository';
import { PatientManagementRepository } from '../patient-management/repository/patient-management.repository';
import { PatientManagementService } from '../patient-management/service/patient-management.service';
import { ProspectiveArrivalRepository } from './repository/prospective-arrival.repository';
import { ProspectiveArrivalService } from './service/prospective-arrival.service';

/**
 * The `P17-T04` guarantees that only exist once a real transaction is involved.
 *
 * Three of them, and all three are about the MRN — the one resource this flow
 * spends and can never take back:
 *
 * **Convert allocates exactly one and repoints the booking atomically.** The
 * unit suite proves the service calls the right collaborator; only a database
 * can prove the counter moved once and the appointment's foreign key followed.
 *
 * **Link allocates none.** That is the entire reason two endpoints exist
 * instead of one, and it is a fact about the counter row, not about the code
 * path taken to reach it.
 *
 * **A failed convert leaves nothing behind.** The failure is injected after
 * the number is allocated and the patient row is inserted — stale
 * privacy-notice evidence, which is a real front-desk mistake, not a
 * contrivance — so the assertion is that the counter rolled back with it. A
 * conversion that burned a number on a record that never committed would show
 * up months later as a gap nobody can explain.
 *
 * Rows are namespaced by a fixed marker and cleared around each run so a shared
 * dev database is never left with live test residue. Patients the real create
 * path produced are retired rather than removed — their privacy-notice evidence
 * is append-only by database trigger, which is the whole point of it.
 */
describe('prospective arrival conversion against Postgres', () => {
  const TEST_MARKER = 'p17-t04-spec';
  const actor = { sub: '' } as unknown as CurrentUser;

  let prisma: PrismaService;
  let arrivalRepository: ProspectiveArrivalRepository;
  let arrivalService: ProspectiveArrivalService;
  let mrnAllocator: MrnAllocatorRepository;
  let doctorId: string;
  let currentPrivacyNoticeVersionId: string;

  /**
   * The scope check runs against the real service, so the actor has to hold
   * `patient.create:any`. The `AuthRepository` is the only collaborator stubbed
   * in this file: seeding a role graph would test the RBAC seed, which has its
   * own suite, and would say nothing about the transaction under test.
   */
  const authRepositoryStub = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  function buildCreatePayload(overrides: Partial<CreatePatientInput> = {}): CreatePatientInput {
    return {
      fullName: `${TEST_MARKER} Siti Rahayu`,
      dateOfBirth: '1991-03-14',
      sex: 'FEMALE',
      status: 'OUT_PATIENT',
      phoneNumber: '628121000004',
      address: 'Jl. Kenanga No. 3, Bandung',
      isActive: true,
      privacyNotice: {
        privacyNoticeVersionId: currentPrivacyNoticeVersionId,
        locale: 'id',
        outcome: 'ACKNOWLEDGED',
        subjectType: 'SELF',
        provenance: 'FRONT_DESK',
      },
      ...overrides,
    } as CreatePatientInput;
  }

  async function createProspectiveWithBooking(params: {
    suffix: string;
    fullName?: string;
    phoneNumber?: string;
  }): Promise<{ prospectivePatientId: string; appointmentId: string }> {
    const prospective = await prisma.prospectivePatient.create({
      data: {
        fullName: params.fullName ?? `${TEST_MARKER} ${params.suffix}`,
        phoneNumber: params.phoneNumber ?? '628121000004',
        channel: 'TELEGRAM',
        externalChatId: `${TEST_MARKER}-${params.suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });
    const appointment = await prisma.appointment.create({
      data: {
        prospectivePatientId: prospective.id,
        doctorId,
        type: 'SESSION',
        scheduledAt: new Date('2026-09-01T02:00:00.000Z'),
        bookingSource: 'TELEGRAM',
        bookingReferenceCode: `${TEST_MARKER}-${params.suffix}`,
      },
      select: { id: true },
    });
    return { prospectivePatientId: prospective.id, appointmentId: appointment.id };
  }

  async function readMrnCounter(): Promise<bigint> {
    const rows = await prisma.$queryRaw<{ nextValue: bigint }[]>`
      SELECT "next_value" AS "nextValue" FROM "mrn_counters" LIMIT 1
    `;
    const nextValue = rows[0]?.nextValue;

    if (nextValue === undefined) {
      throw new Error('MRN counter row is missing: run database migrations before this suite');
    }

    return BigInt(nextValue);
  }

  async function deleteTestRows(): Promise<void> {
    await prisma.appointment.deleteMany({
      where: { bookingReferenceCode: { startsWith: TEST_MARKER } },
    });
    await prisma.prospectivePatient.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
    // Rows this file inserted directly carry no privacy-notice evidence and go
    // cleanly.
    await prisma.patientProfile.deleteMany({
      where: { fullName: { startsWith: TEST_MARKER }, privacyNoticeRecords: { none: {} } },
    });
    // The ones the real create path produced cannot be removed at all: their
    // privacy-notice evidence is append-only by database trigger, deliberately,
    // because it is legal evidence about a person. They are retired the way the
    // product retires a record instead, so a shared dev database is left with no
    // live test residue.
    await prisma.patientProfile.updateMany({
      where: { fullName: { startsWith: TEST_MARKER }, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    await prisma.doctorProfile.deleteMany({ where: { licenseNumber: { startsWith: TEST_MARKER } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    // The front-desk actor is named by the same append-only evidence rows, so
    // it gets the same treatment as the patients it registered.
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_MARKER }, privacyNoticeRecords: { none: {} } },
    });
    await prisma.user.updateMany({
      where: { email: { startsWith: TEST_MARKER }, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    await deleteTestRows();

    // Upserted rather than created: a previous run's actor survives teardown
    // retired but present, because the evidence rows it wrote name it forever.
    const frontDeskUser = await prisma.user.upsert({
      where: { email: `${TEST_MARKER}@example.test` },
      update: { deletedAt: null, isActive: true },
      create: { email: `${TEST_MARKER}@example.test`, passwordHash: '!no-login' },
      select: { id: true },
    });
    (actor as { sub: string }).sub = frontDeskUser.id;
    (authRepositoryStub.findUserById as jest.Mock).mockResolvedValue({
      id: frontDeskUser.id,
      roles: [
        {
          role: {
            permissions: [
              { permission: { resource: 'Patient', action: 'create', scope: 'ANY' } },
              { permission: { resource: 'Patient', action: 'update', scope: 'ANY' } },
              { permission: { resource: 'Patient', action: 'read', scope: 'ANY' } },
            ],
          },
        },
      ],
    });

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

    const version = await prisma.privacyNoticeVersion.findFirstOrThrow({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: { effectiveAt: 'desc' },
      select: { id: true },
    });
    currentPrivacyNoticeVersionId = version.id;

    const configService = new ConfigService();
    const identifierCrypto = new NationalIdentifierCryptoService(configService);
    const privacyNoticeRepository = new PrivacyNoticeRepository(prisma);
    mrnAllocator = new MrnAllocatorRepository(configService);
    arrivalRepository = new ProspectiveArrivalRepository(prisma);
    arrivalService = new ProspectiveArrivalService(
      arrivalRepository,
      new PatientManagementService(
        new PatientManagementRepository(
          prisma,
          identifierCrypto,
          mrnAllocator,
          privacyNoticeRepository,
        ),
        authRepositoryStub,
        { record: jest.fn() } as unknown as AuditService,
        privacyNoticeRepository,
      ),
      identifierCrypto,
      { record: jest.fn() } as unknown as AuditService,
    );
  });

  afterAll(async () => {
    await deleteTestRows();
    await prisma.$disconnect();
  });

  describe('convert (the one place an MRN is spent)', () => {
    it('allocates exactly one MRN and repoints the booking in the same transaction', async () => {
      const { prospectivePatientId, appointmentId } = await createProspectiveWithBooking({
        suffix: 'convert',
      });
      const counterBefore = await readMrnCounter();

      const result = await arrivalService.convertToNewPatient(
        prospectivePatientId,
        buildCreatePayload(),
        actor,
      );

      expect(await readMrnCounter()).toBe(counterBefore + 1n);
      expect(result.mrn).toBe(mrnAllocator.formatMrn(counterBefore));
      expect(result.movedAppointments).toBe(1);
      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { patientId: true, prospectivePatientId: true },
      });
      expect(appointment.patientId).toBe(result.patientId);
      // Cleared, not merely overwritten: the appointment's CHECK allows exactly
      // one of the two columns, so leaving the old side set would have aborted
      // the transaction (`P17-T02`).
      expect(appointment.prospectivePatientId).toBeNull();
      const prospective = await prisma.prospectivePatient.findUniqueOrThrow({
        where: { id: prospectivePatientId },
        select: { status: true, patientId: true, convertedById: true, convertedAt: true },
      });
      expect(prospective).toMatchObject({
        status: 'CONVERTED',
        patientId: result.patientId,
        convertedById: actor.sub,
      });
      expect(prospective.convertedAt).not.toBeNull();
    });

    it('refuses to spend a second MRN on a record that already converted', async () => {
      const { prospectivePatientId } = await createProspectiveWithBooking({ suffix: 'twice' });
      await arrivalService.convertToNewPatient(
        prospectivePatientId,
        buildCreatePayload(),
        actor,
      );
      const counterAfterFirst = await readMrnCounter();

      await expect(
        arrivalService.convertToNewPatient(prospectivePatientId, buildCreatePayload(), actor),
      ).rejects.toThrow(/already been resolved/);
      expect(await readMrnCounter()).toBe(counterAfterFirst);
    });

    it('rolls back completely when the create fails after the number is allocated', async () => {
      const { prospectivePatientId, appointmentId } = await createProspectiveWithBooking({
        suffix: 'rollback',
      });
      const counterBefore = await readMrnCounter();

      await expect(
        arrivalService.convertToNewPatient(
          prospectivePatientId,
          buildCreatePayload({
            fullName: `${TEST_MARKER} rollback subject`,
            privacyNotice: {
              // A superseded notice version: the front desk's screen was open
              // across a policy update. It fails inside `captureCurrent`, which
              // runs after the MRN is allocated and the patient row inserted.
              privacyNoticeVersionId: '00000000-0000-4000-8000-000000000000',
              locale: 'id',
              outcome: 'ACKNOWLEDGED',
              subjectType: 'SELF',
              provenance: 'FRONT_DESK',
            },
          }),
          actor,
        ),
      ).rejects.toThrow();

      // No orphan MRN.
      expect(await readMrnCounter()).toBe(counterBefore);
      // No half-created patient.
      const patients = await prisma.patientProfile.findMany({
        where: { fullName: `${TEST_MARKER} rollback subject` },
        select: { id: true },
      });
      expect(patients).toHaveLength(0);
      // No half-linked appointment.
      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { patientId: true, prospectivePatientId: true },
      });
      expect(appointment.patientId).toBeNull();
      expect(appointment.prospectivePatientId).toBe(prospectivePatientId);
      const prospective = await prisma.prospectivePatient.findUniqueOrThrow({
        where: { id: prospectivePatientId },
        select: { status: true },
      });
      expect(prospective.status).toBe('AWAITING_ARRIVAL');
    });
  });

  describe('link (the arriving person is already a patient)', () => {
    it('repoints the booking without touching the MRN counter', async () => {
      const existing = await prisma.patientProfile.create({
        data: {
          mrn: `${TEST_MARKER}-existing`,
          fullName: `${TEST_MARKER} Siti Rahayu Wulandari`,
          phoneNumber: '0812 1000-004',
          dateOfBirth: new Date('1991-03-14T00:00:00.000Z'),
          address: 'Bandung',
        },
        select: { id: true },
      });
      const { prospectivePatientId, appointmentId } = await createProspectiveWithBooking({
        suffix: 'link',
      });
      const counterBefore = await readMrnCounter();

      const result = await arrivalService.linkToExistingPatient(
        prospectivePatientId,
        { patientId: existing.id },
        actor,
      );

      expect(await readMrnCounter()).toBe(counterBefore);
      expect(result).toMatchObject({
        resolution: 'LINKED',
        patientId: existing.id,
        mrn: `${TEST_MARKER}-existing`,
        movedAppointments: 1,
      });
      const appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: { patientId: true, prospectivePatientId: true },
      });
      expect(appointment.patientId).toBe(existing.id);
      expect(appointment.prospectivePatientId).toBeNull();
      const prospective = await prisma.prospectivePatient.findUniqueOrThrow({
        where: { id: prospectivePatientId },
        select: { status: true, patientId: true },
      });
      expect(prospective).toMatchObject({ status: 'LINKED', patientId: existing.id });
    });
  });

  describe('match-candidates (the search that has to happen first)', () => {
    it('finds the returning patient whose stored number is written differently', async () => {
      const existing = await prisma.patientProfile.create({
        data: {
          mrn: `${TEST_MARKER}-match`,
          fullName: `${TEST_MARKER} Budi Santoso`,
          // Written the way a front desk types it years earlier; the booking
          // carries `62…`. A raw comparison would miss exactly this person.
          phoneNumber: '(0812) 1000-005',
          dateOfBirth: new Date('1988-02-04T00:00:00.000Z'),
          address: 'Bandung',
        },
        select: { id: true },
      });
      const { prospectivePatientId } = await createProspectiveWithBooking({
        suffix: 'match',
        fullName: `${TEST_MARKER} Budi Santoso`,
        phoneNumber: '628121000005',
      });

      const candidates = await arrivalService.listMatchCandidates(prospectivePatientId, {
        limit: 8,
      });

      const found = candidates.find((candidate) => candidate.id === existing.id);
      expect(found?.reasons).toEqual(expect.arrayContaining(['PHONE_EXACT', 'NAME_SIMILAR']));
    });
  });
});
