import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SendMailRequest, SendMailResult } from '../../common/mail/mail.types';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * IMP-23 against real Postgres, with the real `PermissionsGuard`.
 *
 * The claims worth a database are the ones a mocked repository cannot make
 * honestly: that the raw token never leaves the mail transport, that accepting
 * produces an account which can actually log in with a password no
 * administrator ever saw, and that every way a token stops being usable —
 * consumed, revoked by a resend, revoked by hand, lapsed — is refused with a
 * distinguishable status.
 *
 * `MailService` is the one thing overridden. It is replaced by a capturing
 * double rather than an SMTP server because the spec needs to read the link
 * out of the message, which is exactly the invitee's job and the only place
 * the token exists.
 */
describe('User invitations against Postgres', () => {
  const TEST_MARKER = 'imp23-invitations-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = '9eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  const ADMIN_ROLE_CODE = 'IMP23_SPEC_ADMIN';
  const INVITEE_ROLE_CODE = 'IMP23_SPEC_NURSE';
  const INVITEE_EMAIL = `${TEST_MARKER}-invitee@example.test`;
  const INVITEE_PASSWORD = 'sepeda-hijau-di-halaman';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const ADMIN_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'user.read:any', resource: 'User', action: 'read', scope: 'ANY' },
    { permissionKey: 'user.create:any', resource: 'User', action: 'create', scope: 'ANY' },
    { permissionKey: 'user.update:any', resource: 'User', action: 'update', scope: 'ANY' },
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

  function asAdmin(method: 'get' | 'post' | 'delete', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${adminToken}`);
  }

  /**
   * Pulls the token out of the last captured message — the invitee's job,
   * done the invitee's way. Nothing else in this spec is allowed to know a
   * token, which is what makes "the API never returns it" a real assertion
   * rather than a restatement of the mock.
   */
  function lastEmailedToken(): string {
    const lastMail = sentMails.at(-1);
    const match = lastMail?.text.match(/\/invite\/([A-Za-z0-9_-]+)/);
    const token = match?.[1];
    if (!token) {
      throw new Error('No invitation link found in the captured email');
    }
    return token;
  }

  async function seedAdmin(): Promise<void> {
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
    await prisma.role.upsert({
      where: { code: INVITEE_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: INVITEE_ROLE_CODE, name: `${TEST_MARKER} nurse`, isSystem: false },
    });
  }

  async function removeFixtures(): Promise<void> {
    const invitedUsers = await prisma.user.findMany({
      where: { email: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const userIds = [...invitedUsers.map((user) => user.id), ADMIN_USER_ID];
    await prisma.userInvitation.deleteMany({ where: { invitedById: { in: userIds } } });
    // `audit_logs` is append-only at the database level (SJ-4) — the trigger
    // refuses DELETE, and rightly so. The rows this spec writes are left
    // behind, which is why the audit assertion below matches on the run's own
    // invitation id rather than on a count.
    const roles = await prisma.role.findMany({
      where: { code: { in: [ADMIN_ROLE_CODE, INVITEE_ROLE_CODE] } },
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
    const jwtService = moduleRef.get(JwtService);
    await removeFixtures();
    await seedAdmin();
    adminToken = await jwtService.signAsync(
      { sub: ADMIN_USER_ID, email: `${TEST_MARKER}-admin@example.test` },
      { secret: JWT_SECRET },
    );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('rejects an anonymous caller on the admin routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/users/invitations');

    expect(response.status).toBe(401);
  });

  it('refuses an invitation naming a role that does not exist', async () => {
    const response = await asAdmin('post', '/api/v1/users/invitations').send({
      email: `${TEST_MARKER}-nobody@example.test`,
      roleCodes: ['IMP23_SPEC_NO_SUCH_ROLE'],
    });

    expect(response.status).toBe(400);
  });

  describe('the happy path, end to end', () => {
    let invitationId: string;
    let emailedToken: string;

    it('records the invitation and returns no token', async () => {
      const response = await asAdmin('post', '/api/v1/users/invitations').send({
        email: INVITEE_EMAIL,
        roleCodes: [INVITEE_ROLE_CODE],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('PENDING');
      expect(response.body.data.email).toBe(INVITEE_EMAIL);
      expect(JSON.stringify(response.body)).not.toMatch(/token/i);
      invitationId = response.body.data.id;
      emailedToken = lastEmailedToken();
    });

    it('emails the invitee a link, and only the invitee', async () => {
      const lastMail = sentMails.at(-1);

      expect(lastMail?.to).toBe(INVITEE_EMAIL);
      expect(lastMail?.text).toContain(`/invite/${emailedToken}`);
    });

    it('refuses a second live invitation to the same address', async () => {
      const response = await asAdmin('post', '/api/v1/users/invitations').send({
        email: INVITEE_EMAIL,
        roleCodes: [INVITEE_ROLE_CODE],
      });

      expect(response.status).toBe(409);
    });

    it('shows the invitation in the pending list without a token', async () => {
      const response = await asAdmin('get', '/api/v1/users/invitations?status=PENDING');

      expect(response.status).toBe(200);
      const ids = response.body.data.map((row: { id: string }) => row.id);
      expect(ids).toContain(invitationId);
      expect(JSON.stringify(response.body)).not.toMatch(/tokenHash/i);
    });

    it('previews the invitation for an unauthenticated caller', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/invitations/${emailedToken}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.email).toBe(INVITEE_EMAIL);
      expect(response.body.data.roles).toBeUndefined();
    });

    it('refuses a password below the policy floor', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/invitations/${emailedToken}/accept`)
        .send({ password: 'short' });

      expect(response.status).toBe(400);
    });

    it('accepts the invitation and activates the account', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/invitations/${emailedToken}/accept`)
        .send({ password: INVITEE_PASSWORD });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({ email: INVITEE_EMAIL });
      const invitedUser = await prisma.user.findUnique({
        where: { email: INVITEE_EMAIL },
        include: { roles: { include: { role: true } } },
      });
      expect(invitedUser?.isActive).toBe(true);
      expect(invitedUser?.roles.map((userRole) => userRole.role.code)).toEqual([INVITEE_ROLE_CODE]);
    });

    // The whole ticket in one assertion: the account works, and the only
    // person who ever knew the password is the person who chose it.
    it('lets the invitee log in with the password they chose', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: INVITEE_EMAIL, password: INVITEE_PASSWORD });

      expect(response.status).toBe(200);
    });

    it('refuses the token a second time, distinguishably', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/invitations/${emailedToken}/accept`)
        .send({ password: INVITEE_PASSWORD });

      expect(response.status).toBe(409);
    });

    it('writes the invite and accept audit rows', async () => {
      const actions = await prisma.auditLog.findMany({
        where: { resource: 'user_invitation', resourceId: invitationId },
        select: { action: true },
      });
      const actionNames = actions.map((row) => row.action);

      expect(actionNames).toContain('USER_INVITED');
      expect(actionNames).toContain('USER_INVITE_ACCEPTED');
    });
  });

  describe('tokens that have stopped working', () => {
    async function inviteFresh(emailSuffix: string): Promise<{ id: string; token: string }> {
      const response = await asAdmin('post', '/api/v1/users/invitations').send({
        email: `${TEST_MARKER}-${emailSuffix}@example.test`,
        roleCodes: [INVITEE_ROLE_CODE],
      });
      expect(response.status).toBe(201);
      return { id: response.body.data.id, token: lastEmailedToken() };
    }

    it('kills the previous link on resend and issues a working replacement', async () => {
      const original = await inviteFresh('resend');

      const resend = await asAdmin('post', `/api/v1/users/invitations/${original.id}/resend`);
      expect(resend.status).toBe(201);
      const replacementToken = lastEmailedToken();
      expect(replacementToken).not.toBe(original.token);

      const oldLink = await request(app.getHttpServer()).get(
        `/api/v1/invitations/${original.token}`,
      );
      expect(oldLink.status).toBe(410);

      const newLink = await request(app.getHttpServer()).get(
        `/api/v1/invitations/${replacementToken}`,
      );
      expect(newLink.status).toBe(200);
    });

    it('kills the link on revoke and keeps the row readable', async () => {
      const invitation = await inviteFresh('revoke');

      const revoke = await asAdmin('delete', `/api/v1/users/invitations/${invitation.id}`);
      expect(revoke.status).toBe(200);
      expect(revoke.body.data.status).toBe('REVOKED');

      const response = await request(app.getHttpServer()).get(
        `/api/v1/invitations/${invitation.token}`,
      );
      expect(response.status).toBe(410);
    });

    it('refuses a lapsed link', async () => {
      const invitation = await inviteFresh('expired');
      await prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const response = await request(app.getHttpServer()).get(
        `/api/v1/invitations/${invitation.token}`,
      );

      expect(response.status).toBe(410);
    });

    it('404s on a token nobody was ever sent', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/v1/invitations/not-a-real-token',
      );

      expect(response.status).toBe(404);
    });
  });
});
