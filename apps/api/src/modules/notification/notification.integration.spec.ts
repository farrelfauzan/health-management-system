import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * IMP-21 against real Postgres, with the real `PermissionsGuard`.
 *
 * The claim worth a database is the scoping one: the feed is OWN-scoped by
 * construction, so one user must never see, count, or mark another user's
 * rows — and a wrong-owner id must be indistinguishable from a missing one.
 *
 * CI's database is migrated but not seeded, so the catalog rows the spec
 * needs are upserted by key and left in place; everything else is namespaced
 * by `TEST_MARKER` and removed.
 */
describe('Notifications against Postgres', () => {
  const TEST_MARKER = 'imp21-notifications-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const RECIPIENT_USER_ID = '9ccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const OTHER_USER_ID = '9ddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  const ROLE_CODE = 'IMP21_SPEC_MEMBER';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const MEMBER_PERMISSIONS: readonly CatalogSeed[] = [
    {
      permissionKey: 'notification.read:own',
      resource: 'Notification',
      action: 'read',
      scope: 'OWN',
    },
    {
      permissionKey: 'notification.manage:own',
      resource: 'Notification',
      action: 'manage',
      scope: 'OWN',
    },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let recipientToken: string;
  let otherToken: string;
  let recipientNotificationId: string;
  let otherNotificationId: string;

  function asUser(token: string, method: 'get' | 'patch' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${token}`);
  }

  async function signTokenFor(userId: string): Promise<string> {
    return jwtService.signAsync(
      { sub: userId, email: `${TEST_MARKER}-${userId}@example.test` },
      { secret: JWT_SECRET },
    );
  }

  async function upsertUser(userId: string): Promise<void> {
    await prisma.user.upsert({
      where: { id: userId },
      update: { isActive: true, deletedAt: null },
      create: {
        id: userId,
        email: `${TEST_MARKER}-${userId}@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
  }

  async function seedRole(userId: string): Promise<void> {
    for (const entry of MEMBER_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: MEMBER_PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: ROLE_CODE },
      update: { deletedAt: null },
      create: { code: ROLE_CODE, name: `${TEST_MARKER} member`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId, roleId: role.id },
    });
  }

  async function removeFixtures(): Promise<void> {
    await prisma.notification.deleteMany({
      where: { userId: { in: [RECIPIENT_USER_ID, OTHER_USER_ID] } },
    });
    const roles = await prisma.role.findMany({
      where: { code: ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: {
        OR: [
          { roleId: { in: roleIds } },
          { userId: { in: [RECIPIENT_USER_ID, OTHER_USER_ID] } },
        ],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [RECIPIENT_USER_ID, OTHER_USER_ID] } } });
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
    await upsertUser(RECIPIENT_USER_ID);
    await upsertUser(OTHER_USER_ID);
    await seedRole(RECIPIENT_USER_ID);
    await seedRole(OTHER_USER_ID);
    recipientToken = await signTokenFor(RECIPIENT_USER_ID);
    otherToken = await signTokenFor(OTHER_USER_ID);
    const recipientRow = await prisma.notification.create({
      data: {
        userId: RECIPIENT_USER_ID,
        type: 'APPOINTMENT_APPROVED',
        titleKey: 'appointmentApproved.title',
        bodyKey: 'appointmentApproved.body',
        params: { doctorName: `${TEST_MARKER} doctor` },
      },
    });
    recipientNotificationId = recipientRow.id;
    const otherRow = await prisma.notification.create({
      data: {
        userId: OTHER_USER_ID,
        type: 'CONVERSATION_HANDOFF',
        titleKey: 'conversationHandoff.title',
        bodyKey: 'conversationHandoff.body',
        params: { channel: 'TELEGRAM' },
        href: '/admin/conversations',
      },
    });
    otherNotificationId = otherRow.id;
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('rejects an anonymous caller', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/notifications');
    expect(response.status).toBe(401);
  });

  it('lists only the caller’s own rows', async () => {
    const response = await asUser(recipientToken, 'get', '/api/v1/notifications');
    expect(response.status).toBe(200);
    const ids = response.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(recipientNotificationId);
    expect(ids).not.toContain(otherNotificationId);
    expect(response.body.meta).toEqual({ page: 1, limit: 10, total: 1 });
    expect(response.body.data[0]).toMatchObject({
      type: 'APPOINTMENT_APPROVED',
      titleKey: 'appointmentApproved.title',
      params: { doctorName: `${TEST_MARKER} doctor` },
      readAt: null,
    });
  });

  it('counts only the caller’s unread rows', async () => {
    const response = await asUser(recipientToken, 'get', '/api/v1/notifications/unread-count');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ unreadCount: 1 });
  });

  it('refuses to mark another user’s row and does not reveal it exists', async () => {
    const response = await asUser(
      recipientToken,
      'patch',
      `/api/v1/notifications/${otherNotificationId}/read`,
    );
    expect(response.status).toBe(404);
    const untouched = await prisma.notification.findUnique({
      where: { id: otherNotificationId },
    });
    expect(untouched?.readAt).toBeNull();
  });

  it('marks the caller’s own row read, and again idempotently', async () => {
    const first = await asUser(
      recipientToken,
      'patch',
      `/api/v1/notifications/${recipientNotificationId}/read`,
    );
    expect(first.status).toBe(200);
    expect(first.body.data.readAt).not.toBeNull();
    const again = await asUser(
      recipientToken,
      'patch',
      `/api/v1/notifications/${recipientNotificationId}/read`,
    );
    expect(again.status).toBe(200);
    expect(again.body.data.readAt).toBe(first.body.data.readAt);
    const count = await asUser(recipientToken, 'get', '/api/v1/notifications/unread-count');
    expect(count.body.data).toEqual({ unreadCount: 0 });
  });

  it('read-all flips only the other caller’s own rows', async () => {
    const response = await asUser(otherToken, 'post', '/api/v1/notifications/read-all');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 1 });
    const count = await asUser(otherToken, 'get', '/api/v1/notifications/unread-count');
    expect(count.body.data).toEqual({ unreadCount: 0 });
  });
});
