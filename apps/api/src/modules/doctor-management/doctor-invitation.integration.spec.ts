import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { MailService } from '../../common/mail/mail.service';
import { SendMailRequest, SendMailResult } from '../../common/mail/mail.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * P19-T15 (SJ-172) against real Postgres, with the real `PermissionsGuard`.
 *
 * The claim worth a database is the one a mocked repository cannot make: that
 * entering an email on the create-doctor form actually produces an account the
 * doctor can sign in with, linked to the profile, with no second trip through
 * Administration — and that the link survives the accept transaction, which is
 * where the profile and the freshly minted user meet.
 *
 * `MailService` is the single override, a capturing double rather than an SMTP
 * server, because the invitation link only exists in the message and reading it
 * out is exactly the invitee's job. It also makes "exactly one invitation" a
 * countable assertion rather than a hope.
 */
describe('Doctor creation with a linked user account against Postgres', () => {
  const TEST_MARKER = 'p19t15-doctor-invite-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = '9dddddd0-dddd-4ddd-8ddd-dddddddddd01';
  const ADMIN_ROLE_CODE = 'P19T15_SPEC_ADMIN';
  const DOCTOR_ROLE_CODE = 'DOCTOR';
  const RECEPTIONIST_ROLE_CODE = 'P19T15_SPEC_RECEPTIONIST';
  const NEW_DOCTOR_EMAIL = `${TEST_MARKER}-new@example.test`;
  const EXISTING_USER_EMAIL = `${TEST_MARKER}-existing@example.test`;
  const TAKEN_DOCTOR_EMAIL = `${TEST_MARKER}-taken@example.test`;
  const INVITEE_PASSWORD = 'kunci-langit-biru-2026';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const ADMIN_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'doctor.create:any', resource: 'Doctor', action: 'create', scope: 'ANY' },
    { permissionKey: 'doctor.read:any', resource: 'Doctor', action: 'read', scope: 'ANY' },
  ];

  const sentMails: SendMailRequest[] = [];

  const capturingMailService: MailService = {
    async sendMail(mailRequest: SendMailRequest): Promise<SendMailResult> {
      sentMails.push(mailRequest);
      return { accepted: true, messageId: `${TEST_MARKER}-${sentMails.length}` };
    },
  };

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let specialtyId: string;
  let existingUserId: string;

  function asAdmin(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  /** Pulls the link out of the last captured message, the invitee's way. */
  function lastEmailedToken(): string {
    const token = sentMails.at(-1)?.text.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1];
    if (!token) {
      throw new Error('No invitation link found in the captured email');
    }
    return token;
  }

  function mailsTo(email: string): SendMailRequest[] {
    return sentMails.filter((mail) => mail.to === email);
  }

  function buildDoctorPayload(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      fullName: 'Dr. Spec Subject',
      specialtyId,
      phoneNumber: '+628120000000',
      ...overrides,
    };
  }

  async function seedCatalog(): Promise<void> {
    await prisma.user.upsert({
      where: { id: ADMIN_USER_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: ADMIN_USER_ID,
        email: `${TEST_MARKER}-admin@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
    for (const entry of ADMIN_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: ADMIN_PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const adminRole = await prisma.role.upsert({
      where: { code: ADMIN_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: ADMIN_ROLE_CODE, name: `${TEST_MARKER} admin`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: ADMIN_USER_ID, roleId: adminRole.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: ADMIN_USER_ID, roleId: adminRole.id },
    });
    // `DOCTOR` is a seeded catalog row, but CI runs `migrate deploy` and never
    // seeds, so the suite provides it rather than assuming it. Upsert, not
    // create: on a seeded database this is the row `seed.sql` already owns, and
    // teardown deliberately leaves it alone.
    await prisma.role.upsert({
      where: { code: DOCTOR_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: DOCTOR_ROLE_CODE, name: 'Doctor', isSystem: false },
    });
    await prisma.role.upsert({
      where: { code: RECEPTIONIST_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: RECEPTIONIST_ROLE_CODE, name: `${TEST_MARKER} reception`, isSystem: false },
    });
    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER} Internal Medicine` },
      select: { id: true },
    });
    specialtyId = specialty.id;
  }

  async function removeFixtures(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    const doctors = await prisma.doctorProfile.findMany({
      where: { licenseNumber: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const doctorIds = doctors.map((doctor) => doctor.id);
    await prisma.userInvitation.deleteMany({
      where: { OR: [{ invitedById: { in: userIds } }, { doctorProfileId: { in: doctorIds } }] },
    });
    await prisma.doctorProfile.deleteMany({ where: { id: { in: doctorIds } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    // `DOCTOR` is intentionally absent here: it is a real catalog role this
    // suite may have created, and deleting it on a seeded database would take
    // a production row down with the fixtures.
    const roles = await prisma.role.findMany({
      where: { code: { in: [ADMIN_ROLE_CODE, RECEPTIONIST_ROLE_CODE] } },
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(capturingMailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await removeFixtures();
    await seedCatalog();
    adminToken = await moduleRef
      .get(JwtService)
      .signAsync(
        { sub: ADMIN_USER_ID, email: `${TEST_MARKER}-admin@example.test` },
        { secret: JWT_SECRET },
      );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  describe('a brand new address', () => {
    let doctorId: string;
    let emailedToken: string;

    it('creates the doctor and raises exactly one invitation', async () => {
      const response = await asAdmin('post', '/api/v1/doctors').send(
        buildDoctorPayload({
          licenseNumber: `${TEST_MARKER}-LIC-NEW`,
          nik: '3173011503800011',
          email: NEW_DOCTOR_EMAIL,
        }),
      );

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBe(NEW_DOCTOR_EMAIL);
      expect(response.body.data.invitationStatus).toBe('PENDING');
      expect(response.body.data.ownerUserId).toBeUndefined();
      expect(mailsTo(NEW_DOCTOR_EMAIL)).toHaveLength(1);
      doctorId = response.body.data.id;
      emailedToken = lastEmailedToken();
    });

    it('binds the invitation to the profile it was raised for', async () => {
      const invitation = await prisma.userInvitation.findFirst({
        where: { doctorProfileId: doctorId },
        select: { email: true, roleCodes: true, consumedAt: true },
      });

      expect(invitation).toMatchObject({
        email: NEW_DOCTOR_EMAIL,
        roleCodes: [DOCTOR_ROLE_CODE],
        consumedAt: null,
      });
    });

    it('links the account to the profile when the invitation is accepted', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/invitations/${emailedToken}/accept`)
        .send({ password: INVITEE_PASSWORD });

      expect(response.status).toBe(201);
      const doctor = await prisma.doctorProfile.findUnique({
        where: { id: doctorId },
        select: { ownerUser: { select: { email: true } } },
      });
      expect(doctor?.ownerUser?.email).toBe(NEW_DOCTOR_EMAIL);
    });

    it('reads back as accepted, with the address now coming from the account', async () => {
      const response = await asAdmin('get', `/api/v1/doctors/${doctorId}`);

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(NEW_DOCTOR_EMAIL);
      expect(response.body.data.invitationStatus).toBe('ACCEPTED');
      expect(response.body.data.ownerUserId).toEqual(expect.any(String));
    });
  });

  describe('an address that already has an account', () => {
    let doctorId: string;

    beforeAll(async () => {
      const receptionist = await prisma.role.findUnique({
        where: { code: RECEPTIONIST_ROLE_CODE },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: {
          email: EXISTING_USER_EMAIL,
          passwordHash: 'not-a-hash',
          isActive: true,
          roles: { create: [{ roleId: receptionist?.id ?? '' }] },
        },
        select: { id: true },
      });
      existingUserId = user.id;
    });

    it('attaches the account instead of inviting anybody twice', async () => {
      const mailsBefore = sentMails.length;

      const response = await asAdmin('post', '/api/v1/doctors').send(
        buildDoctorPayload({
          licenseNumber: `${TEST_MARKER}-LIC-EXISTING`,
          nik: '3173011503800012',
          email: EXISTING_USER_EMAIL,
        }),
      );

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBe(EXISTING_USER_EMAIL);
      expect(response.body.data.invitationStatus).toBe('ACCEPTED');
      expect(response.body.data.ownerUserId).toBe(existingUserId);
      expect(sentMails).toHaveLength(mailsBefore);
      doctorId = response.body.data.id;
    });

    it('writes no invitation row for an account that already exists', async () => {
      const invitations = await prisma.userInvitation.count({
        where: { doctorProfileId: doctorId },
      });

      expect(invitations).toBe(0);
    });

    it('adds DOCTOR without taking away the roles the account already held', async () => {
      const roles = await prisma.userRole.findMany({
        where: { userId: existingUserId, deletedAt: null },
        select: { role: { select: { code: true } } },
      });

      expect(roles.map((entry) => entry.role.code).sort()).toEqual(
        [DOCTOR_ROLE_CODE, RECEPTIONIST_ROLE_CODE].sort(),
      );
    });
  });

  describe('an address that already belongs to a doctor', () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: { email: TAKEN_DOCTOR_EMAIL, passwordHash: 'not-a-hash', isActive: true },
        select: { id: true },
      });
      await prisma.doctorProfile.create({
        data: {
          licenseNumber: `${TEST_MARKER}-LIC-TAKEN`,
          fullName: 'Dr. Already Linked',
          specialtyId,
          ownerUserId: user.id,
        },
      });
    });

    it('refuses with a field-level conflict', async () => {
      const response = await asAdmin('post', '/api/v1/doctors').send(
        buildDoctorPayload({
          licenseNumber: `${TEST_MARKER}-LIC-CLASH`,
          nik: '3173011503800013',
          email: TAKEN_DOCTOR_EMAIL,
        }),
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DOCTOR_EMAIL_ALREADY_LINKED');
      expect(response.body.error.details).toMatchObject({ email: expect.any(String) });
    });

    it('leaves no half-created doctor behind', async () => {
      const orphan = await prisma.doctorProfile.count({
        where: { licenseNumber: `${TEST_MARKER}-LIC-CLASH` },
      });

      expect(orphan).toBe(0);
    });
  });

  describe('no address at all', () => {
    it('behaves exactly as it did before, with no account and no invitation', async () => {
      const mailsBefore = sentMails.length;

      const response = await asAdmin('post', '/api/v1/doctors').send(
        buildDoctorPayload({
          licenseNumber: `${TEST_MARKER}-LIC-NONE`,
          nik: '3173011503800014',
        }),
      );

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBeUndefined();
      expect(response.body.data.invitationStatus).toBeUndefined();
      expect(response.body.data.ownerUserId).toBeUndefined();
      expect(sentMails).toHaveLength(mailsBefore);
      const invitations = await prisma.userInvitation.count({
        where: { doctorProfileId: response.body.data.id },
      });
      expect(invitations).toBe(0);
    });
  });
});
