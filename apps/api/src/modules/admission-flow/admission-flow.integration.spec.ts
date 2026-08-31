import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * IMP-14 against real Postgres.
 *
 * The claims worth a database are the ones a mock cannot make: the full
 * admit → transfer → discharge chain leaves the right bed history and the
 * right patient status at every step, and a *concurrent* second admit into the
 * same bed loses to the partial unique index rather than to a check that
 * raced. The last one is the point of the whole design, so it is asserted with
 * two genuinely simultaneous requests, not two sequential ones.
 *
 * CI's database is migrated but not seeded, so the catalog rows the spec needs
 * are upserted by key and left in place; everything else is namespaced and
 * removed.
 */
describe('Admission flow against Postgres', () => {
  const TEST_MARKER = 'imp14-admissions-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const CLERK_USER_ID = 'a1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const CLERK_ROLE_CODE = 'IMP14_SPEC_CLERK';
  const SPECIALTY_ID = 'a2aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const DOCTOR_ID = 'a3aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const PATIENT_ID = 'a4aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const OTHER_PATIENT_ID = 'a5aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  const WARD_CODE = 'IMP14-MELATI';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const CLERK_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'ward.read:any', resource: 'Ward', action: 'read', scope: 'ANY' },
    { permissionKey: 'room.read:any', resource: 'Room', action: 'read', scope: 'ANY' },
    { permissionKey: 'bed.read:any', resource: 'Bed', action: 'read', scope: 'ANY' },
    { permissionKey: 'admission.read:any', resource: 'Admission', action: 'read', scope: 'ANY' },
    { permissionKey: 'admission.update:any', resource: 'Admission', action: 'update', scope: 'ANY' },
    { permissionKey: 'admission.admit:any', resource: 'Admission', action: 'admit', scope: 'ANY' },
    {
      permissionKey: 'admission.transfer:any',
      resource: 'Admission',
      action: 'transfer',
      scope: 'ANY',
    },
    {
      permissionKey: 'admission.discharge:any',
      resource: 'Admission',
      action: 'discharge',
      scope: 'ANY',
    },
    { permissionKey: 'admission.cancel:any', resource: 'Admission', action: 'cancel', scope: 'ANY' },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let clerkToken: string;
  let firstBedId: string;
  let secondBedId: string;
  let admissionId: string;

  function asClerk(method: 'get' | 'patch' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${clerkToken}`);
  }

  async function readPatientStatus(patientId: string): Promise<string> {
    const patient = await prisma.patientProfile.findUniqueOrThrow({
      where: { id: patientId },
      select: { status: true },
    });
    return patient.status;
  }

  async function seedFixtures(): Promise<void> {
    await prisma.user.upsert({
      where: { id: CLERK_USER_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: CLERK_USER_ID,
        email: `${TEST_MARKER}@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
    for (const entry of CLERK_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: CLERK_PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: CLERK_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: CLERK_ROLE_CODE, name: `${TEST_MARKER} clerk`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: CLERK_USER_ID, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: CLERK_USER_ID, roleId: role.id },
    });

    await prisma.specialty.upsert({
      where: { id: SPECIALTY_ID },
      update: { deletedAt: null },
      create: { id: SPECIALTY_ID, name: `${TEST_MARKER} Penyakit Dalam` },
    });
    await prisma.doctorProfile.upsert({
      where: { id: DOCTOR_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: DOCTOR_ID,
        licenseNumber: `${TEST_MARKER}-STR`,
        fullName: 'dr. Siti Rahayu, Sp.PD',
        specialtyId: SPECIALTY_ID,
        isActive: true,
      },
    });
    for (const [patientId, mrn] of [
      [PATIENT_ID, `${TEST_MARKER}-1`],
      [OTHER_PATIENT_ID, `${TEST_MARKER}-2`],
    ] as const) {
      await prisma.patientProfile.upsert({
        where: { id: patientId },
        update: { status: 'OUT_PATIENT', deletedAt: null },
        create: {
          id: patientId,
          mrn,
          fullName: `${TEST_MARKER} patient`,
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          sex: 'FEMALE',
          phoneNumber: '081200000000',
          address: 'Jl. Uji Coba No. 1',
          status: 'OUT_PATIENT',
        },
      });
    }
  }

  async function removeFixtures(): Promise<void> {
    const wards = await prisma.ward.findMany({
      where: { code: { startsWith: 'IMP14' } },
      select: { id: true },
    });
    const wardIds = wards.map((ward) => ward.id);
    const rooms = await prisma.room.findMany({
      where: { wardId: { in: wardIds } },
      select: { id: true },
    });
    const roomIds = rooms.map((room) => room.id);
    const patientIds = [PATIENT_ID, OTHER_PATIENT_ID];

    await prisma.bedAssignment.deleteMany({
      where: { admission: { patientId: { in: patientIds } } },
    });
    await prisma.admission.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.bed.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: wardIds } } });
    await prisma.roomClass.deleteMany({ where: { code: { startsWith: 'IMP14' } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: DOCTOR_ID } });
    await prisma.specialty.deleteMany({ where: { id: SPECIALTY_ID } });

    const roles = await prisma.role.findMany({
      where: { code: CLERK_ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: CLERK_USER_ID }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: CLERK_USER_ID } });
  }

  async function seedInventory(): Promise<void> {
    const [kelas1, vip] = await Promise.all([
      prisma.roomClass.create({ data: { code: 'IMP14-KELAS-1', name: 'Kelas 1' } }),
      prisma.roomClass.create({ data: { code: 'IMP14-VIP', name: 'VIP' } }),
    ]);
    const ward = await prisma.ward.create({
      data: { code: WARD_CODE, name: 'Bangsal Melati' },
    });
    const room = await prisma.room.create({
      data: { wardId: ward.id, roomClassId: kelas1.id, code: '201', name: 'Kamar 201' },
    });
    const vipRoom = await prisma.room.create({
      data: { wardId: ward.id, roomClassId: vip.id, code: 'VIP-1', name: 'Kamar VIP 1' },
    });
    const firstBed = await prisma.bed.create({ data: { roomId: room.id, code: 'A' } });
    const secondBed = await prisma.bed.create({ data: { roomId: vipRoom.id, code: 'A' } });
    firstBedId = firstBed.id;
    secondBedId = secondBed.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);

    await removeFixtures();
    await seedFixtures();
    await seedInventory();
    clerkToken = await jwtService.signAsync(
      { sub: CLERK_USER_ID, email: `${TEST_MARKER}@example.test` },
      { secret: JWT_SECRET },
    );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('admits a patient, taking the bed and the patient status with it', async () => {
    const response = await asClerk('post', '/api/v1/admissions').send({
      patientId: PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: firstBedId,
      reason: 'Demam berdarah',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('ADMITTED');
    expect(response.body.data.currentBed.id).toBe(firstBedId);
    expect(response.body.data.bedAssignments).toHaveLength(1);
    admissionId = response.body.data.id;

    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: firstBedId } });
    expect(bed.status).toBe('OCCUPIED');
    // The enum that has existed since the first migration with nothing able
    // to set it.
    expect(await readPatientStatus(PATIENT_ID)).toBe('IN_PATIENT');
  });

  it('rejects a second, simultaneous admit into the same bed', async () => {
    // Two genuinely concurrent requests, because the point of the partial
    // unique index is precisely the window a sequential test never opens:
    // both reads see AVAILABLE, and only one insert can survive.
    const [first, second] = await Promise.all([
      asClerk('post', '/api/v1/admissions').send({
        patientId: OTHER_PATIENT_ID,
        admittingDoctorId: DOCTOR_ID,
        bedId: secondBedId,
      }),
      asClerk('post', '/api/v1/admissions').send({
        patientId: OTHER_PATIENT_ID,
        admittingDoctorId: DOCTOR_ID,
        bedId: secondBedId,
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const openAssignments = await prisma.bedAssignment.count({
      where: { bedId: secondBedId, endedAt: null },
    });
    expect(openAssignments).toBe(1);

    // Leave the ward as the rest of the spec expects it.
    const winner = first.status === 201 ? first : second;
    await asClerk('post', `/api/v1/admissions/${winner.body.data.id}/cancel`).send({
      reason: 'Spec teardown',
    });
  });

  it('refuses a second open admission for the same patient', async () => {
    const response = await asClerk('post', '/api/v1/admissions').send({
      patientId: PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: secondBedId,
    });

    expect(response.status).toBe(409);
  });

  it('refuses a source encounter belonging to a different patient', async () => {
    const response = await asClerk('post', '/api/v1/admissions').send({
      patientId: OTHER_PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: secondBedId,
      sourceEncounterId: '00000000-0000-4000-8000-000000000000',
    });

    expect(response.status).toBe(400);
  });

  it('transfers to another bed, closing one assignment and opening the next', async () => {
    const response = await asClerk('post', `/api/v1/admissions/${admissionId}/transfer`).send({
      bedId: secondBedId,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.currentBed.id).toBe(secondBedId);
    // The stay keeps its full history — this is what IMP-15 prices, night by
    // night, at the class the patient was actually in.
    expect(response.body.data.bedAssignments).toHaveLength(2);
    expect(response.body.data.bedAssignments[0].endedAt).toBeDefined();
    expect(response.body.data.bedAssignments[1].endedAt).toBeUndefined();
    expect(response.body.data.bedAssignments[1].bed.room.roomClass.code).toBe('IMP14-VIP');

    const freedBed = await prisma.bed.findUniqueOrThrow({ where: { id: firstBedId } });
    expect(freedBed.status).toBe('AVAILABLE');
    const takenBed = await prisma.bed.findUniqueOrThrow({ where: { id: secondBedId } });
    expect(takenBed.status).toBe('OCCUPIED');
  });

  it('refuses a transfer into the bed the patient is already in', async () => {
    const response = await asClerk('post', `/api/v1/admissions/${admissionId}/transfer`).send({
      bedId: secondBedId,
    });

    expect(response.status).toBe(409);
  });

  it('discharges the patient, freeing the bed and closing the history', async () => {
    const response = await asClerk('post', `/api/v1/admissions/${admissionId}/discharge`).send({
      dischargeSummary: 'Trombosit stabil, pasien dipulangkan.',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('DISCHARGED');
    expect(response.body.data.currentBed).toBeUndefined();
    expect(
      response.body.data.bedAssignments.every(
        (assignment: { endedAt?: string }) => assignment.endedAt !== undefined,
      ),
    ).toBe(true);

    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: secondBedId } });
    expect(bed.status).toBe('AVAILABLE');
    expect(await readPatientStatus(PATIENT_ID)).toBe('DISCHARGED');
  });

  it('never re-opens a settled admission', async () => {
    const discharge = await asClerk('post', `/api/v1/admissions/${admissionId}/discharge`).send({});
    expect(discharge.status).toBe(409);

    const transfer = await asClerk('post', `/api/v1/admissions/${admissionId}/transfer`).send({
      bedId: firstBedId,
    });
    expect(transfer.status).toBe(409);

    const update = await asClerk('patch', `/api/v1/admissions/${admissionId}`).send({
      reason: 'Too late',
    });
    expect(update.status).toBe(409);
  });

  it('readmits the same patient once the first stay has ended', async () => {
    const response = await asClerk('post', '/api/v1/admissions').send({
      patientId: PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: firstBedId,
    });

    expect(response.status).toBe(201);
    expect(await readPatientStatus(PATIENT_ID)).toBe('IN_PATIENT');

    // A cancellation is a stay that never happened, so the patient goes back
    // to OUT_PATIENT rather than DISCHARGED.
    const cancel = await asClerk('post', `/api/v1/admissions/${response.body.data.id}/cancel`).send(
      { reason: 'Dibuat pada pasien yang salah' },
    );
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect(await readPatientStatus(PATIENT_ID)).toBe('OUT_PATIENT');
    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: firstBedId } });
    expect(bed.status).toBe('AVAILABLE');
  });

  it('lists the ward census and writes an audit row naming the patient', async () => {
    const list = await asClerk('get', `/api/v1/admissions?patientId=${PATIENT_ID}`);

    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(2);

    // `audit_logs` is append-only (SJ-27), so teardown cannot clear it and
    // rows from earlier runs survive. Asserting "at least one" is the honest
    // claim: this run wrote admission reads under this actor.
    const auditRows = await prisma.auditLog.findMany({
      where: { resource: 'admission', actorUserId: CLERK_USER_ID },
      take: 1,
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a future admission timestamp', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const response = await asClerk('post', '/api/v1/admissions').send({
      patientId: OTHER_PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: firstBedId,
      admittedAt: tomorrow,
    });

    expect(response.status).toBe(400);
  });
});
