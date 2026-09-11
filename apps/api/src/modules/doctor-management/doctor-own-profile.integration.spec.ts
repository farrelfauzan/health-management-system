import { randomUUID } from 'node:crypto';

import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * P20-T03 against real Postgres, with the real `PermissionsGuard`.
 *
 * The claims a mocked repository cannot make: that "own" is the profile whose
 * `ownerUserId` is the caller and nothing else, that the fields D-025 keeps
 * with the clinic are refused even on the doctor's own record, and that
 * handing doctors `doctor.update:own` opened neither the administrative route
 * nor the credential catalog.
 */
describe('A doctor editing their own profile against Postgres (P20-T03)', () => {
  const TEST_MARKER = 'p20t03-doctor-own-profile-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const DOCTOR_USER_ID = '9ddddd30-dddd-4ddd-8ddd-dddddddddd31';
  const COLLEAGUE_USER_ID = '9ddddd30-dddd-4ddd-8ddd-dddddddddd32';
  const NO_PROFILE_USER_ID = '9ddddd30-dddd-4ddd-8ddd-dddddddddd33';
  const DOCTOR_ROLE_CODE = 'P20T03_SPEC_DOCTOR';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  // The two keys the seed gives DOCTOR that matter here.
  const DOCTOR_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'doctor.read:any', resource: 'Doctor', action: 'read', scope: 'ANY' },
    { permissionKey: 'doctor.update:own', resource: 'Doctor', action: 'update', scope: 'OWN' },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let specialtyId: string;
  let ownDoctorId: string;
  let colleagueDoctorId: string;

  function emailFor(userId: string): string {
    return `${TEST_MARKER}-${userId.slice(-2)}@example.test`;
  }

  // Signed once in `beforeAll`, so a request helper can stay synchronous and
  // chain `.send()` the way supertest expects.
  const tokenByUserId = new Map<string, string>();

  function asUser(userId: string, method: 'get' | 'patch' | 'post', path: string) {
    const token = tokenByUserId.get(userId) ?? '';
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
  }

  async function seedRole(): Promise<string> {
    for (const entry of DOCTOR_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: DOCTOR_PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: DOCTOR_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: DOCTOR_ROLE_CODE, name: `${TEST_MARKER} doctor`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    return role.id;
  }

  async function seedFixtures(): Promise<void> {
    const roleId = await seedRole();
    for (const userId of [DOCTOR_USER_ID, COLLEAGUE_USER_ID, NO_PROFILE_USER_ID]) {
      await prisma.user.create({
        data: { id: userId, email: emailFor(userId), passwordHash: 'not-a-hash', isActive: true },
      });
      await prisma.userRole.create({ data: { userId, roleId } });
    }
    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Internal Medicine` },
      select: { id: true },
    });
    specialtyId = specialty.id;
    const ownDoctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-LIC-OWN`,
        fullName: 'Dr. Own Profile',
        specialtyId,
        ownerUserId: DOCTOR_USER_ID,
      },
      select: { id: true },
    });
    ownDoctorId = ownDoctor.id;
    const colleague = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-LIC-COLLEAGUE`,
        fullName: 'Dr. Colleague',
        specialtyId,
        ownerUserId: COLLEAGUE_USER_ID,
      },
      select: { id: true },
    });
    colleagueDoctorId = colleague.id;
  }

  async function removeFixtures(): Promise<void> {
    const userIds = [DOCTOR_USER_ID, COLLEAGUE_USER_ID, NO_PROFILE_USER_ID];
    await prisma.doctorProfile.deleteMany({
      where: { licenseNumber: { startsWith: TEST_MARKER } },
    });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    const roles = await prisma.role.findMany({
      where: { code: DOCTOR_ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: { in: userIds } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  async function readOwnFullName(): Promise<string | undefined> {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: ownDoctorId },
      select: { fullName: true, specialtyId: true },
    });
    return doctor?.fullName;
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
    for (const userId of [DOCTOR_USER_ID, COLLEAGUE_USER_ID, NO_PROFILE_USER_ID]) {
      tokenByUserId.set(
        userId,
        await jwtService.signAsync(
          { sub: userId, email: emailFor(userId) },
          { secret: JWT_SECRET },
        ),
      );
    }
    await removeFixtures();
    await seedFixtures();
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('reads their own profile, found through the account rather than an id', async () => {
    const response = await asUser(DOCTOR_USER_ID, 'get', '/api/v1/me/doctor-profile');

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(ownDoctorId);
    expect(response.body.data.fullName).toBe('Dr. Own Profile');
  });

  it('corrects their own name and phone, audited with themselves as the actor', async () => {
    const response = await asUser(DOCTOR_USER_ID, 'patch', '/api/v1/me/doctor-profile').send({
      fullName: 'Dr. Own Profile Corrected',
      phoneNumber: '081234567890',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.fullName).toBe('Dr. Own Profile Corrected');
    expect(await readOwnFullName()).toBe('Dr. Own Profile Corrected');
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'UPDATE',
        resource: 'DoctorProfile',
        resourceId: ownDoctorId,
        actorUserId: DOCTOR_USER_ID,
      },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true },
    });
    expect(audit?.metadata).toEqual({ scope: 'OWN', fields: ['fullName', 'phoneNumber'] });
  });

  it.each([
    ['specialtyId', randomUUID()],
    ['nik', '3173011503800021'],
    ['satusehatPractitionerId', '10009880728'],
    ['licenses', []],
    ['isActive', false],
    ['ownerUserId', null],
  ])('refuses the administrative field %s, even on their own record', async (field, value) => {
    const response = await asUser(DOCTOR_USER_ID, 'patch', '/api/v1/me/doctor-profile').send({
      fullName: 'Should Not Stick',
      [field]: value,
    });

    expect(response.status).toBe(400);
    expect(await readOwnFullName()).toBe('Dr. Own Profile Corrected');
  });

  it("cannot edit a colleague's profile through the administrative route", async () => {
    const response = await asUser(
      DOCTOR_USER_ID,
      'patch',
      `/api/v1/doctors/${colleagueDoctorId}`,
    ).send({ fullName: 'Dr. Hijacked' });

    expect(response.status).toBe(403);
    const colleague = await prisma.doctorProfile.findUnique({
      where: { id: colleagueDoctorId },
      select: { fullName: true },
    });
    expect(colleague?.fullName).toBe('Dr. Colleague');
  });

  it('cannot reach their own credentials through the administrative route either', async () => {
    const response = await asUser(DOCTOR_USER_ID, 'patch', `/api/v1/doctors/${ownDoctorId}`).send({
      isActive: false,
    });

    expect(response.status).toBe(403);
  });

  it('gives an account with no doctor profile a clean 404', async () => {
    const readResponse = await asUser(NO_PROFILE_USER_ID, 'get', '/api/v1/me/doctor-profile');
    const writeResponse = await asUser(
      NO_PROFILE_USER_ID,
      'patch',
      '/api/v1/me/doctor-profile',
    ).send({ fullName: 'Nobody' });

    expect(readResponse.status).toBe(404);
    expect(readResponse.body.error.code).toBe('DOCTOR_PROFILE_NOT_FOUND');
    expect(writeResponse.status).toBe(404);
  });

  it('cannot change the credential catalog every doctor is described by', async () => {
    const response = await asUser(DOCTOR_USER_ID, 'post', '/api/v1/doctor-credential-options').send(
      { kind: 'DEGREE', code: 'P20T03_SPEC_FAKE', label: 'Sp.Fake', sortOrder: 999 },
    );

    expect(response.status).toBe(403);
    const created = await prisma.doctorCredentialOption.count({
      where: { code: 'P20T03_SPEC_FAKE' },
    });
    expect(created).toBe(0);
  });
});
