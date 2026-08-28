import { OrganizationUnitTreeResponse } from '@hms/shared-types';
import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * SJ-1 against real Postgres, with the real `PermissionsGuard`.
 *
 * The claims worth a database are the ones a mock cannot make: the permission
 * gate really refuses a reader on every write, a move really rewrites the
 * descendants' paths on disk, the depth cap really counts the levels that exist,
 * a hard delete really is refused while something points at the row, and the
 * `RESTRICT` foreign keys really stand behind that refusal.
 *
 * CI's database is migrated but not seeded, so the catalog rows the spec needs
 * are upserted by key and left in place; everything else is namespaced by
 * `TEST_MARKER` and removed.
 */
describe('Organization structure against Postgres', () => {
  const TEST_MARKER = 'sj1-org-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const MANAGER_USER_ID = '7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const READER_USER_ID = '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const MEMBER_USER_ID = '7ccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const MANAGER_ROLE_CODE = 'SJ1_SPEC_MANAGER';
  const READER_ROLE_CODE = 'SJ1_SPEC_READER';
  const UNIT_NAME_PREFIX = 'SJ1-';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const READ_PERMISSION: CatalogSeed = {
    permissionKey: 'organization.structure.read:any',
    resource: 'OrganizationUnit',
    action: 'read',
    scope: 'ANY',
  };

  const MANAGE_PERMISSION: CatalogSeed = {
    permissionKey: 'organization.structure.manage:any',
    resource: 'OrganizationUnit',
    action: 'manage',
    scope: 'ANY',
  };

  const MANAGER_PERMISSIONS: readonly CatalogSeed[] = [READ_PERMISSION, MANAGE_PERMISSION];
  const READER_PERMISSIONS: readonly CatalogSeed[] = [READ_PERMISSION];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let managerToken: string;
  let readerToken: string;
  let divisionId: string;
  let departmentId: string;
  let teamId: string;

  function asManager(method: 'delete' | 'get' | 'patch' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${managerToken}`);
  }

  function asReader(method: 'delete' | 'get' | 'patch' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${readerToken}`);
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
      update: { isActive: true, deletedAt: null, organizationUnitId: null },
      create: {
        id: userId,
        email: `${TEST_MARKER}-${userId}@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
  }

  async function seedRole(
    roleCode: string,
    entries: readonly CatalogSeed[],
    userId: string,
  ): Promise<void> {
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
    const userIds = [MANAGER_USER_ID, READER_USER_ID, MEMBER_USER_ID];
    // Members first: `users.organization_unit_id` is RESTRICT, so a unit with a
    // member still pointing at it cannot be deleted — which is exactly what one
    // of the assertions below relies on.
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { organizationUnitId: null },
    });
    // Deepest first, because `parent_id` is RESTRICT too.
    const units = await prisma.organizationUnit.findMany({
      where: { name: { startsWith: UNIT_NAME_PREFIX } },
      select: { id: true, path: true },
    });
    const deepestFirst = [...units].sort((left, right) => right.path.length - left.path.length);
    for (const unit of deepestFirst) {
      await prisma.organizationUnit.deleteMany({ where: { id: unit.id } });
    }

    const roles = await prisma.role.findMany({
      where: { code: { in: [MANAGER_ROLE_CODE, READER_ROLE_CODE] } },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: { in: userIds } }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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
    await upsertUser(MANAGER_USER_ID);
    await upsertUser(READER_USER_ID);
    await upsertUser(MEMBER_USER_ID);
    await seedRole(MANAGER_ROLE_CODE, MANAGER_PERMISSIONS, MANAGER_USER_ID);
    await seedRole(READER_ROLE_CODE, READER_PERMISSIONS, READER_USER_ID);
    managerToken = await signTokenFor(MANAGER_USER_ID);
    readerToken = await signTokenFor(READER_USER_ID);
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('builds a three-level tree', async () => {
    const division = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Clinical Services`,
      kind: 'DIVISION',
    });
    expect(division.status).toBe(201);
    expect(division.body.data).toMatchObject({ parentId: null, depth: 1, memberCount: 0 });
    divisionId = division.body.data.id;

    const department = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Nursing`,
      kind: 'DEPARTMENT',
      parentId: divisionId,
    });
    expect(department.status).toBe(201);
    expect(department.body.data).toMatchObject({ parentId: divisionId, depth: 2 });
    departmentId = department.body.data.id;

    const team = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Ward A`,
      kind: 'TEAM',
      parentId: departmentId,
    });
    expect(team.status).toBe(201);
    expect(team.body.data.depth).toBe(3);
    teamId = team.body.data.id;
  });

  it('returns the whole tree nested in one call', async () => {
    const response = await asManager('get', '/api/v1/organization-units/tree');

    expect(response.status).toBe(200);
    const tree = response.body.data as OrganizationUnitTreeResponse;
    const division = tree.roots.find((node) => node.id === divisionId);
    expect(division?.children[0]?.id).toBe(departmentId);
    expect(division?.children[0]?.children[0]?.id).toBe(teamId);
    expect(tree.maxDepth).toBeGreaterThanOrEqual(3);
  });

  it('rejects a create that would breach the six-level cap', async () => {
    // Extend the chain to the cap, then try once more.
    let parentId = teamId;
    for (const level of [4, 5, 6]) {
      const created = await asManager('post', '/api/v1/organization-units').send({
        name: `${UNIT_NAME_PREFIX}Level ${level}`,
        kind: 'TEAM',
        parentId,
      });
      expect(created.status).toBe(201);
      expect(created.body.data.depth).toBe(level);
      parentId = created.body.data.id;
    }

    const tooDeep = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Level 7`,
      kind: 'TEAM',
      parentId,
    });

    expect(tooDeep.status).toBe(400);
    expect(tooDeep.body.error.code).toBe('ORGANIZATION_UNIT_DEPTH_EXCEEDED');
  });

  it('refuses to move a unit under its own descendant', async () => {
    const response = await asManager('patch', `/api/v1/organization-units/${divisionId}/move`).send(
      { parentId: teamId },
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ORGANIZATION_UNIT_CYCLE');
  });

  it('recomputes descendant paths when a subtree moves', async () => {
    const secondRoot = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Support Services`,
      kind: 'DIVISION',
    });
    expect(secondRoot.status).toBe(201);
    const secondRootId = secondRoot.body.data.id as string;

    const moved = await asManager('patch', `/api/v1/organization-units/${departmentId}/move`).send({
      parentId: secondRootId,
    });

    expect(moved.status).toBe(200);
    expect(moved.body.data.parentId).toBe(secondRootId);
    // The assertion that matters: the descendant nobody edited now addresses
    // its new ancestry on disk.
    const team = await prisma.organizationUnit.findUnique({
      where: { id: teamId },
      select: { path: true },
    });
    expect(team?.path.startsWith(`/${secondRootId}/${departmentId}/`)).toBe(true);
  });

  it('refuses a hard delete while sub-units remain, then allows it once empty', async () => {
    const parent = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Doomed Parent`,
      kind: 'BRANCH',
    });
    const parentId = parent.body.data.id as string;
    const child = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Doomed Child`,
      kind: 'TEAM',
      parentId,
    });
    const childId = child.body.data.id as string;

    const blocked = await asManager('delete', `/api/v1/organization-units/${parentId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ORGANIZATION_UNIT_HAS_CHILDREN');

    expect((await asManager('delete', `/api/v1/organization-units/${childId}`)).status).toBe(200);
    expect((await asManager('delete', `/api/v1/organization-units/${parentId}`)).status).toBe(200);
  });

  it('refuses a hard delete while a member still points at the unit', async () => {
    const unit = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Staffed Unit`,
      kind: 'TEAM',
    });
    const unitId = unit.body.data.id as string;
    await prisma.user.update({
      where: { id: MEMBER_USER_ID },
      data: { organizationUnitId: unitId },
    });

    const blocked = await asManager('delete', `/api/v1/organization-units/${unitId}`);

    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ORGANIZATION_UNIT_HAS_MEMBERS');
  });

  it('counts members on the unit itself, not rolled up from descendants', async () => {
    const response = await asManager('get', '/api/v1/organization-units/tree');

    const tree = response.body.data as OrganizationUnitTreeResponse;
    const staffed = tree.roots.find((node) => node.name === `${UNIT_NAME_PREFIX}Staffed Unit`);
    expect(staffed?.memberCount).toBe(1);
  });

  it('archives a leaf, which then leaves the default tree but not the archived one', async () => {
    const unit = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Wound Down`,
      kind: 'TEAM',
    });
    const unitId = unit.body.data.id as string;

    expect((await asManager('post', `/api/v1/organization-units/${unitId}/archive`)).status).toBe(
      201,
    );

    const defaultTree = await asManager('get', '/api/v1/organization-units/tree');
    const defaultIds = (defaultTree.body.data as OrganizationUnitTreeResponse).roots.map(
      (node) => node.id,
    );
    expect(defaultIds).not.toContain(unitId);

    const archivedTree = await asManager(
      'get',
      '/api/v1/organization-units/tree?includeArchived=true',
    );
    const archived = (archivedTree.body.data as OrganizationUnitTreeResponse).roots.find(
      (node) => node.id === unitId,
    );
    expect(archived?.archivedAt).toBeDefined();
  });

  it('refuses to archive a unit that still has live sub-units', async () => {
    // Builds its own pair rather than reusing the tree above: an earlier test
    // re-parents that department, so which units still have children depends on
    // execution order.
    const parent = await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Still Populated`,
      kind: 'BRANCH',
    });
    const parentId = parent.body.data.id as string;
    await asManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Still Populated Child`,
      kind: 'TEAM',
      parentId,
    });

    const response = await asManager('post', `/api/v1/organization-units/${parentId}/archive`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORGANIZATION_UNIT_HAS_CHILDREN');
  });

  it('lets a read-only role see the tree', async () => {
    const response = await asReader('get', '/api/v1/organization-units/tree');

    expect(response.status).toBe(200);
    expect(Array.isArray((response.body.data as OrganizationUnitTreeResponse).roots)).toBe(true);
  });

  it('refuses every write to a read-only role', async () => {
    // The whole point of splitting read from manage: the screen may render a
    // tree for this account, and the API must still refuse every edit on it.
    const create = await asReader('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Should Not Exist`,
      kind: 'TEAM',
    });
    const update = await asReader('patch', `/api/v1/organization-units/${divisionId}`).send({
      name: `${UNIT_NAME_PREFIX}Renamed`,
    });
    const move = await asReader('patch', `/api/v1/organization-units/${divisionId}/move`).send({
      parentId: null,
    });
    const archive = await asReader('post', `/api/v1/organization-units/${divisionId}/archive`);
    const remove = await asReader('delete', `/api/v1/organization-units/${divisionId}`);

    for (const response of [create, update, move, archive, remove]) {
      expect(response.status).toBe(403);
    }
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/organization-units/tree');

    expect(response.status).toBe(401);
  });
});
