import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PasswordHasherService } from '../../common/crypto/password-hasher.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * P20-T02 against real Postgres, signing in for real.
 *
 * The gate lives in a cookie the API writes when it issues a session, so the
 * claims worth a database are end-to-end ones: that an invited doctor with no
 * profile is flagged at sign-in, that a doctor the administrator created is
 * never flagged, that completing the profile creates one they own, and that
 * the next refresh lifts the flag — read off the actual `Set-Cookie` headers.
 */
describe('Doctor profile completion against Postgres (P20-T02)', () => {
  const TEST_MARKER = 'p20t02-profile-completion-spec';
  const PASSWORD = 'kunci-langit-biru-2026';
  const INVITED_USER_ID = '9ddddd40-dddd-4ddd-8ddd-dddddddddd41';
  const ADMIN_MADE_USER_ID = '9ddddd40-dddd-4ddd-8ddd-dddddddddd42';
  const STAFF_USER_ID = '9ddddd40-dddd-4ddd-8ddd-dddddddddd43';
  const USER_IDS = [INVITED_USER_ID, ADMIN_MADE_USER_ID, STAFF_USER_ID] as const;
  const DOCTOR_ROLE_CODE = 'DOCTOR';
  const STAFF_ROLE_CODE = 'P20T02_SPEC_STAFF';
  const HINT_COOKIE = 'hms_session_hint';
  const REFRESH_COOKIE = 'hms_refresh_token';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  // Both roles hold exactly the keys the completion route's guard asks for, so
  // the staff role proves the service's DOCTOR-role check, not the guard.
  const PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'doctor.read:any', resource: 'Doctor', action: 'read', scope: 'ANY' },
    { permissionKey: 'doctor.update:own', resource: 'Doctor', action: 'update', scope: 'OWN' },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let specialtyId: string;
  let otherSpecialtyId: string;
  let invitedRefreshToken: string;
  let invitedAccessToken: string;

  function emailFor(userId: string): string {
    return `${TEST_MARKER}-${userId.slice(-2)}@example.test`;
  }

  function readCookie(response: request.Response, name: string): string | undefined {
    const setCookies = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const entry = setCookies.find((cookie) => cookie.startsWith(`${name}=`));
    return entry ? decodeURIComponent(entry.split(';')[0]!.slice(name.length + 1)) : undefined;
  }

  function readHint(response: request.Response): Record<string, unknown> {
    const value = readCookie(response, HINT_COOKIE) ?? '';
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
  }

  async function signIn(userId: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailFor(userId), password: PASSWORD });
    expect(response.body.data?.status).toBe('AUTHENTICATED');
    return {
      hint: readHint(response),
      accessToken: response.body.data.tokens.accessToken as string,
      refreshToken: readCookie(response, REFRESH_COOKIE) ?? '',
    };
  }

  function complete(accessToken: string, payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/me/doctor-profile/completion')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
  }

  async function seedRole(code: string): Promise<string> {
    const role = await prisma.role.upsert({
      where: { code },
      update: { deletedAt: null },
      create: {
        code,
        name: code === DOCTOR_ROLE_CODE ? 'Doctor' : `${TEST_MARKER} staff`,
        isSystem: false,
      },
    });
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    return role.id;
  }

  async function seedUser(userId: string, roleId: string, passwordHash: string): Promise<void> {
    await prisma.user.create({
      data: { id: userId, email: emailFor(userId), passwordHash, isActive: true },
    });
    await prisma.userRole.create({ data: { userId, roleId } });
  }

  async function seedFixtures(passwordHash: string): Promise<void> {
    for (const entry of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    // `DOCTOR` is a seeded catalog row that CI never seeds, so the suite
    // provides it, and teardown leaves it alone.
    const doctorRoleId = await seedRole(DOCTOR_ROLE_CODE);
    const staffRoleId = await seedRole(STAFF_ROLE_CODE);
    await seedUser(INVITED_USER_ID, doctorRoleId, passwordHash);
    await seedUser(ADMIN_MADE_USER_ID, doctorRoleId, passwordHash);
    await seedUser(STAFF_USER_ID, staffRoleId, passwordHash);
    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Internal Medicine` },
      select: { id: true },
    });
    specialtyId = specialty.id;
    const otherSpecialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Neurology` },
      select: { id: true },
    });
    otherSpecialtyId = otherSpecialty.id;
    // What the create-doctor form leaves behind (D-024): every required field.
    await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-STR-ADMIN-MADE`,
        fullName: 'Dr. Admin Made',
        specialtyId,
        phoneNumber: '628129876501',
        nikLast4: '0042',
        ownerUserId: ADMIN_MADE_USER_ID,
      },
    });
  }

  async function removeFixtures(): Promise<void> {
    await prisma.doctorProfile.deleteMany({
      where: { licenseNumber: { startsWith: TEST_MARKER } },
    });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    const staffRoles = await prisma.role.findMany({
      where: { code: STAFF_ROLE_CODE },
      select: { id: true },
    });
    const staffRoleIds = staffRoles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: staffRoleIds } }, { userId: { in: [...USER_IDS] } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: staffRoleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: staffRoleIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [...USER_IDS] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...USER_IDS] } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const passwordHash = await moduleRef.get(PasswordHasherService).hashPassword(PASSWORD);
    await removeFixtures();
    await seedFixtures(passwordHash);
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('flags a doctor invited without a profile the moment they sign in', async () => {
    const session = await signIn(INVITED_USER_ID);

    expect(session.hint.profileIncomplete).toBe(true);
    invitedAccessToken = session.accessToken;
    invitedRefreshToken = session.refreshToken;
  });

  it('never flags a doctor whose profile the administrator created', async () => {
    const session = await signIn(ADMIN_MADE_USER_ID);

    expect(session.hint).not.toHaveProperty('profileIncomplete');
  });

  it('never flags a role other than DOCTOR', async () => {
    const session = await signIn(STAFF_USER_ID);

    expect(session.hint).not.toHaveProperty('profileIncomplete');
  });

  it('refuses completion from somebody who is not a doctor, whatever keys they hold', async () => {
    const session = await signIn(STAFF_USER_ID);

    const response = await complete(session.accessToken, {
      fullName: 'Not A Doctor',
      phoneNumber: '628129876502',
      specialtyId,
      licenseNumber: `${TEST_MARKER}-STR-STAFF`,
      nik: '3173011503800043',
    });

    expect(response.status).toBe(403);
  });

  it('refuses to create a profile without the credentials, naming what is missing', async () => {
    const response = await complete(invitedAccessToken, {
      fullName: 'Dr. Invited',
      phoneNumber: '628129876503',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DOCTOR_PROFILE_FIELDS_REQUIRED');
  });

  it("creates the invited doctor's profile, owned by them", async () => {
    const response = await complete(invitedAccessToken, {
      fullName: 'Dr. Invited',
      phoneNumber: '628129876503',
      specialtyId,
      licenseNumber: `${TEST_MARKER}-STR-INVITED`,
      nik: '3173011503800041',
    });

    expect(response.status).toBe(200);
    const created = await prisma.doctorProfile.findUnique({
      where: { ownerUserId: INVITED_USER_ID },
      select: { fullName: true, specialtyId: true, nikLast4: true },
    });
    expect(created).toEqual({ fullName: 'Dr. Invited', specialtyId, nikLast4: '0041' });
  });

  it('lifts the gate at the next refresh', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${invitedRefreshToken}`);

    expect(response.status).toBe(200);
    expect(readHint(response)).not.toHaveProperty('profileIncomplete');
  });

  it('refuses to change a specialty once it is on file', async () => {
    const response = await complete(invitedAccessToken, {
      fullName: 'Dr. Invited',
      phoneNumber: '628129876503',
      specialtyId: otherSpecialtyId,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DOCTOR_PROFILE_FIELD_LOCKED');
  });
});
