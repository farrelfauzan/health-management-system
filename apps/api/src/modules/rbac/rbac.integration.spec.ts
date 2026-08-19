import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction, PermissionScope } from '../../generated/prisma/client';

/**
 * IMP-1 against real Postgres, with the real `PermissionsGuard` (no
 * `AuthRepository` mock). Two things are proven here that a mocked guard
 * cannot show: a role composed through the API grants access on the very
 * next request, and deleting it revokes that access just as immediately —
 * the guard reads `user_roles` per request, so no token or redeploy is
 * involved.
 *
 * IMP-2 rides along: system roles refuse mutation with a 403 envelope, and
 * every lifecycle mutation leaves a `resource = 'role'` audit row. Audit rows
 * are append-only and stay behind, keyed to role ids that no longer exist —
 * the correct behaviour of an immutable log, not leakage.
 *
 * The permission catalog is seed-owned and CI's database is migrated but not
 * seeded, so the handful of keys the spec needs are upserted by key and left
 * in place; everything else is namespaced by `TEST_MARKER` and removed.
 */
describe('RBAC role management against Postgres', () => {
  const TEST_MARKER = 'imp1-rbac-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ADMIN_USER_ID = '6aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const MEMBER_USER_ID = '6bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ADMIN_ROLE_CODE = 'IMP1_SPEC_ROLE_ADMIN';
  const CUSTOM_ROLE_CODE = 'IMP1_SPEC_FRONT_DESK';
  const SYSTEM_ROLE_CODE = 'IMP1_SPEC_SYSTEM';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const CATALOG_SEED: readonly CatalogSeed[] = [
    { permissionKey: 'role.read:any', resource: 'Role', action: 'read', scope: 'ANY' },
    { permissionKey: 'role.create:any', resource: 'Role', action: 'create', scope: 'ANY' },
    { permissionKey: 'role.update:any', resource: 'Role', action: 'update', scope: 'ANY' },
    { permissionKey: 'role.delete:any', resource: 'Role', action: 'delete', scope: 'ANY' },
    { permissionKey: 'patient.read:any', resource: 'Patient', action: 'read', scope: 'ANY' },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let memberToken: string;
  let customRoleId: string;
  let systemRoleId: string;

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

  async function upsertCatalog(): Promise<void> {
    for (const entry of CATALOG_SEED) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
  }

  async function seedAdminRole(): Promise<void> {
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: CATALOG_SEED.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: ADMIN_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: ADMIN_ROLE_CODE, name: `${TEST_MARKER} role admin`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: ADMIN_USER_ID, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: ADMIN_USER_ID, roleId: role.id },
    });
  }

  async function seedSystemRole(): Promise<void> {
    const role = await prisma.role.upsert({
      where: { code: SYSTEM_ROLE_CODE },
      update: { deletedAt: null, isSystem: true },
      create: { code: SYSTEM_ROLE_CODE, name: `${TEST_MARKER} system`, isSystem: true },
    });
    systemRoleId = role.id;
  }

  async function findRoleAuditActions(roleId: string): Promise<AuditAction[]> {
    const rows = await prisma.auditLog.findMany({
      where: { resource: 'role', resourceId: roleId },
      orderBy: { occurredAt: 'asc' },
      select: { action: true },
    });
    return rows.map((row) => row.action);
  }

  async function removeFixtures(): Promise<void> {
    const roles = await prisma.role.findMany({
      where: { code: { in: [ADMIN_ROLE_CODE, CUSTOM_ROLE_CODE, SYSTEM_ROLE_CODE] } },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: {
        OR: [{ roleId: { in: roleIds } }, { userId: { in: [ADMIN_USER_ID, MEMBER_USER_ID] } }],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_USER_ID, MEMBER_USER_ID] } } });
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
    await upsertCatalog();
    await upsertUser(ADMIN_USER_ID);
    await upsertUser(MEMBER_USER_ID);
    await seedAdminRole();
    await seedSystemRole();
    adminToken = await signTokenFor(ADMIN_USER_ID);
    memberToken = await signTokenFor(MEMBER_USER_ID);
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('lists the permission catalog grouped by resource', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/permissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const roleGroup = response.body.data.find(
      (group: { resource: string }) => group.resource === 'Role',
    );
    expect(roleGroup).toBeDefined();
    const keys = roleGroup.permissions.map(
      (entry: { permissionKey: string }) => entry.permissionKey,
    );
    expect(keys).toEqual(expect.arrayContaining(['role.create:any', 'role.delete:any']));
  });

  it('refuses the catalog to a user without role.read', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/permissions')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(response.status).toBe(403);
  });

  it('creates a custom role that is not a system role', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: CUSTOM_ROLE_CODE, name: `${TEST_MARKER} front desk`, description: 'Desk' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      code: CUSTOM_ROLE_CODE,
      isSystem: false,
      description: 'Desk',
    });
    customRoleId = response.body.data.id;
  });

  it('rejects a duplicate role code with 409', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: CUSTOM_ROLE_CODE, name: 'again' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a malformed role code with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'front desk', name: 'lower case' });

    expect(response.status).toBe(400);
  });

  it('updates name and description but never the code', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/rbac/roles/${customRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${TEST_MARKER} desk lead`, description: null });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe(`${TEST_MARKER} desk lead`);
    expect(response.body.data.code).toBe(CUSTOM_ROLE_CODE);
    expect(response.body.data).not.toHaveProperty('description');
  });

  it('rejects unknown permission keys as a whole', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/rbac/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionKeys: ['role.read:any', 'nothing.here:any'] });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual({ unknownKeys: ['nothing.here:any'] });
    const attached = await prisma.rolePermission.count({ where: { roleId: customRoleId } });
    expect(attached).toBe(0);
  });

  it('replaces the permission set and reports it on the detail route', async () => {
    const setResponse = await request(app.getHttpServer())
      .put(`/api/v1/rbac/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionKeys: ['role.read:any', 'patient.read:any'] });

    expect(setResponse.status).toBe(200);

    const narrowed = await request(app.getHttpServer())
      .put(`/api/v1/rbac/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionKeys: ['role.read:any'] });

    expect(narrowed.status).toBe(200);
    expect(
      narrowed.body.data.permissions.map((entry: { permissionKey: string }) => entry.permissionKey),
    ).toEqual(['role.read:any']);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/rbac/roles/${customRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detail.status).toBe(200);
    expect(detail.body.data.memberCount).toBe(0);
    expect(detail.body.data.permissions).toHaveLength(1);
  });

  it('grants access to a member on the next request, with no new token', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(before.status).toBe(403);

    await prisma.userRole.create({ data: { userId: MEMBER_USER_ID, roleId: customRoleId } });

    const after = await request(app.getHttpServer())
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(after.status).toBe(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/rbac/roles/${customRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.data.memberCount).toBe(1);
  });

  it('soft-deletes the role, revokes its members and hides it from reads', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/rbac/roles/${customRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.revokedAssignmentCount).toBe(1);

    const memberAfter = await request(app.getHttpServer())
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberAfter.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/rbac/roles/${customRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(404);

    const revokedAssignment = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: MEMBER_USER_ID, roleId: customRoleId } },
      select: { deletedAt: true, unassignedById: true },
    });
    expect(revokedAssignment?.deletedAt).not.toBeNull();
    expect(revokedAssignment?.unassignedById).toBe(ADMIN_USER_ID);
  });

  it('refuses to update, delete, or re-permission a system role', async () => {
    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/rbac/roles/${systemRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'renamed' });
    expect(patch.status).toBe(403);
    expect(patch.body.error).toMatchObject({ code: 'FORBIDDEN' });

    const put = await request(app.getHttpServer())
      .put(`/api/v1/rbac/roles/${systemRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionKeys: ['patient.read:any'] });
    expect(put.status).toBe(403);

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/rbac/roles/${systemRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(403);

    const untouched = await prisma.role.findUnique({
      where: { id: systemRoleId },
      select: { name: true, deletedAt: true, _count: { select: { permissions: true } } },
    });
    expect(untouched).toEqual({
      name: `${TEST_MARKER} system`,
      deletedAt: null,
      _count: { permissions: 0 },
    });
    expect(await findRoleAuditActions(systemRoleId)).toEqual([]);
  });

  it('left one audit row per lifecycle mutation of the custom role', async () => {
    const actions = await findRoleAuditActions(customRoleId);

    expect(actions).toEqual([
      AuditAction.ROLE_CREATED,
      AuditAction.ROLE_UPDATED,
      AuditAction.ROLE_PERMISSIONS_CHANGED,
      AuditAction.ROLE_PERMISSIONS_CHANGED,
      AuditAction.ROLE_DELETED,
    ]);

    const diffRows = await prisma.auditLog.findMany({
      where: {
        resource: 'role',
        resourceId: customRoleId,
        action: AuditAction.ROLE_PERMISSIONS_CHANGED,
      },
      orderBy: { occurredAt: 'asc' },
      select: { metadata: true, actorUserId: true },
    });
    expect(diffRows[0]?.actorUserId).toBe(ADMIN_USER_ID);
    expect(diffRows[0]?.metadata).toMatchObject({
      added: ['patient.read:any', 'role.read:any'],
      removed: [],
    });
    expect(diffRows[1]?.metadata).toMatchObject({ added: [], removed: ['patient.read:any'] });
  });

  it('refuses to reuse the code of a deleted role', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: CUSTOM_ROLE_CODE, name: 'resurrected' });

    expect(response.status).toBe(409);
  });
});
