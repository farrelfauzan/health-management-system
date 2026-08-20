import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction, PermissionScope } from '../../generated/prisma/client';

/**
 * IMP-7 against real Postgres, with the real `PermissionsGuard`.
 *
 * The two claims worth a database are the ones a mock cannot make: a toggle
 * changes the availability payload on the very next request, and the split
 * between `feature.read:any` and `feature.read-availability:own` actually
 * holds — a user who can read availability must not be able to read the admin
 * list, because that list carries commercial notes and names a colleague.
 *
 * CI's database is migrated but not seeded, so the handful of catalog rows the
 * spec needs are upserted by key and left in place; everything else is
 * namespaced by `TEST_MARKER` and removed.
 */
describe('Feature entitlements against Postgres', () => {
  const TEST_MARKER = 'imp7-features-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const OPERATOR_USER_ID = '7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STAFF_USER_ID = '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const OPERATOR_ROLE_CODE = 'IMP7_SPEC_OPERATOR';
  const STAFF_ROLE_CODE = 'IMP7_SPEC_STAFF';
  const TOGGLED_KEY = 'bpjs-pcare';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const OPERATOR_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'feature.read:any', resource: 'FeatureEntitlement', action: 'read', scope: 'ANY' },
    {
      permissionKey: 'feature.manage:any',
      resource: 'FeatureEntitlement',
      action: 'manage',
      scope: 'ANY',
    },
  ];

  const STAFF_PERMISSIONS: readonly CatalogSeed[] = [
    {
      permissionKey: 'feature.read-availability:own',
      resource: 'FeatureEntitlement',
      action: 'read-availability',
      scope: 'OWN',
    },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let operatorToken: string;
  let staffToken: string;

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

  async function seedRole(roleCode: string, entries: readonly CatalogSeed[], userId: string) {
    for (const entry of entries) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: entries.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      update: { deletedAt: null },
      create: { code: roleCode, name: `${TEST_MARKER} ${roleCode}`, isSystem: false },
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
    const roles = await prisma.role.findMany({
      where: { code: { in: [OPERATOR_ROLE_CODE, STAFF_ROLE_CODE] } },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: {
        OR: [{ roleId: { in: roleIds } }, { userId: { in: [OPERATOR_USER_ID, STAFF_USER_ID] } }],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [OPERATOR_USER_ID, STAFF_USER_ID] } } });
    await prisma.featureEntitlement.deleteMany({ where: { featureKey: TOGGLED_KEY } });
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
    await upsertUser(OPERATOR_USER_ID);
    await upsertUser(STAFF_USER_ID);
    await seedRole(OPERATOR_ROLE_CODE, OPERATOR_PERMISSIONS, OPERATOR_USER_ID);
    await seedRole(STAFF_ROLE_CODE, STAFF_PERMISSIONS, STAFF_USER_ID);
    operatorToken = await signTokenFor(OPERATOR_USER_ID);
    staffToken = await signTokenFor(STAFF_USER_ID);
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('lists every catalog entry, whether or not a row exists for it', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/features')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(response.status).toBe(200);
    const keys = response.body.data.map((entitlement: { key: string }) => entitlement.key);
    expect(keys).toEqual(expect.arrayContaining([TOGGLED_KEY, 'ai-chatbot', 'pharmacy']));
    const toggled = response.body.data.find(
      (entitlement: { key: string }) => entitlement.key === TOGGLED_KEY,
    );
    expect(toggled.isEnabled).toBe(true);
  });

  it('changes the availability payload on the next request after a toggle', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/features/availability')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.enabledKeys).toContain(TOGGLED_KEY);

    const toggle = await request(app.getHttpServer())
      .put(`/api/v1/admin/features/${TOGGLED_KEY}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ isEnabled: false, notes: 'not in the clinic package' });
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.isEnabled).toBe(false);

    const after = await request(app.getHttpServer())
      .get('/api/v1/features/availability')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(after.status).toBe(200);
    expect(after.body.data.enabledKeys).not.toContain(TOGGLED_KEY);
  });

  it('writes a FEATURE_TOGGLED audit row naming the actor and both states', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { resource: 'feature-entitlement', actorUserId: OPERATOR_USER_ID },
      orderBy: { occurredAt: 'desc' },
      take: 1,
    });

    expect(rows[0]?.action).toBe(AuditAction.FEATURE_TOGGLED);
    expect(rows[0]?.metadata).toMatchObject({
      featureKey: TOGGLED_KEY,
      before: true,
      after: false,
    });
  });

  it('keeps the admin list away from a holder of the availability grant', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/features')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(response.status).toBe(403);
  });

  it('refuses a toggle from a holder of the read grant alone', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/features/${TOGGLED_KEY}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ isEnabled: true });

    expect(response.status).toBe(403);
  });

  it('answers 404 for a key that is not in the catalog', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/admin/features/patients')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ isEnabled: false });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a body that is not a boolean switch', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/admin/features/${TOGGLED_KEY}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ isEnabled: 'no' });

    expect(response.status).toBe(400);
  });
});
