import { OrganizationUnitMemberResponse } from '@hms/shared-types';
import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * SJ-89 against real Postgres, with the real `PermissionsGuard`.
 *
 * The claim this suite exists for is the permission split: an account that may
 * redraw the chart must *not* thereby be able to move people between its boxes,
 * and vice versa. That is the entire justification for
 * `organization.member.manage` being a separate key, and it is only observable
 * with the real guard resolving real rows.
 */
describe('Organization unit membership against Postgres', () => {
  const TEST_MARKER = 'sj89-members-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const MEMBER_MANAGER_USER_ID = '6aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const STRUCTURE_ONLY_USER_ID = '6bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const STAFF_USER_ID = '6ccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const MEMBER_MANAGER_ROLE_CODE = 'SJ89_SPEC_MEMBER_MANAGER';
  const STRUCTURE_ONLY_ROLE_CODE = 'SJ89_SPEC_STRUCTURE_ONLY';
  const UNIT_NAME_PREFIX = 'SJ89-';

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
  const STRUCTURE_MANAGE_PERMISSION: CatalogSeed = {
    permissionKey: 'organization.structure.manage:any',
    resource: 'OrganizationUnit',
    action: 'manage',
    scope: 'ANY',
  };
  const MEMBER_MANAGE_PERMISSION: CatalogSeed = {
    permissionKey: 'organization.member.manage:any',
    resource: 'OrganizationUnitMember',
    action: 'manage',
    scope: 'ANY',
  };

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let memberManagerToken: string;
  let structureOnlyToken: string;
  let unitId: string;
  let otherUnitId: string;

  function asMemberManager(method: 'delete' | 'get' | 'put' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${memberManagerToken}`);
  }

  function asStructureOnly(method: 'delete' | 'get' | 'put' | 'post', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${structureOnlyToken}`);
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
    const userIds = [MEMBER_MANAGER_USER_ID, STRUCTURE_ONLY_USER_ID, STAFF_USER_ID];
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { organizationUnitId: null },
    });
    const units = await prisma.organizationUnit.findMany({
      where: { name: { startsWith: UNIT_NAME_PREFIX } },
      select: { id: true, path: true },
    });
    for (const unit of [...units].sort((l, r) => r.path.length - l.path.length)) {
      await prisma.organizationUnit.deleteMany({ where: { id: unit.id } });
    }
    const roles = await prisma.role.findMany({
      where: { code: { in: [MEMBER_MANAGER_ROLE_CODE, STRUCTURE_ONLY_ROLE_CODE] } },
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
    await upsertUser(MEMBER_MANAGER_USER_ID);
    await upsertUser(STRUCTURE_ONLY_USER_ID);
    await upsertUser(STAFF_USER_ID);
    // Holds read + both manage grants: the ordinary admin.
    await seedRole(
      MEMBER_MANAGER_ROLE_CODE,
      [READ_PERMISSION, STRUCTURE_MANAGE_PERMISSION, MEMBER_MANAGE_PERMISSION],
      MEMBER_MANAGER_USER_ID,
    );
    // Holds read + structure manage, but deliberately NOT member manage.
    await seedRole(
      STRUCTURE_ONLY_ROLE_CODE,
      [READ_PERMISSION, STRUCTURE_MANAGE_PERMISSION],
      STRUCTURE_ONLY_USER_ID,
    );
    memberManagerToken = await signTokenFor(MEMBER_MANAGER_USER_ID);
    structureOnlyToken = await signTokenFor(STRUCTURE_ONLY_USER_ID);

    const unit = await asMemberManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Nursing`,
      kind: 'DEPARTMENT',
    });
    unitId = unit.body.data.id;
    const otherUnit = await asMemberManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Pharmacy`,
      kind: 'DEPARTMENT',
    });
    otherUnitId = otherUnit.body.data.id;
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('assigns a person to a unit and lists them', async () => {
    const assigned = await asMemberManager(
      'put',
      `/api/v1/organization-units/${unitId}/members/${STAFF_USER_ID}`,
    );
    expect(assigned.status).toBe(200);

    const members = await asMemberManager('get', `/api/v1/organization-units/${unitId}/members`);
    expect(members.status).toBe(200);
    const rows = members.body.data as OrganizationUnitMemberResponse[];
    expect(rows.map((row) => row.userId)).toContain(STAFF_USER_ID);
    expect(members.body.meta.total).toBe(1);
  });

  it('counts the new member on the org chart without a second call', async () => {
    const tree = await asMemberManager('get', `/api/v1/organization-units/tree?rootId=${unitId}`);

    expect(tree.body.data.roots[0]?.memberCount).toBe(1);
  });

  it('moves a person between units rather than refusing', async () => {
    const moved = await asMemberManager(
      'put',
      `/api/v1/organization-units/${otherUnitId}/members/${STAFF_USER_ID}`,
    );
    expect(moved.status).toBe(200);

    const oldUnit = await asMemberManager('get', `/api/v1/organization-units/${unitId}/members`);
    const newUnit = await asMemberManager(
      'get',
      `/api/v1/organization-units/${otherUnitId}/members`,
    );
    expect(oldUnit.body.meta.total).toBe(0);
    expect(newUnit.body.meta.total).toBe(1);
  });

  it('records the previous unit on a reassignment', async () => {
    // The half nobody looks at until they need it: without it a reassignment
    // reads as an arrival from nowhere.
    const row = await prisma.auditLog.findFirst({
      where: {
        action: 'ORGANIZATION_UNIT_MEMBER_ASSIGNED',
        resourceId: STAFF_USER_ID,
      },
      orderBy: { occurredAt: 'desc' },
      select: { metadata: true },
    });

    expect(row?.metadata).toMatchObject({
      before: { organizationUnitId: unitId },
      after: { organizationUnitId: otherUnitId },
    });
  });

  it('refuses to re-assign someone to the unit they are already in', async () => {
    const response = await asMemberManager(
      'put',
      `/api/v1/organization-units/${otherUnitId}/members/${STAFF_USER_ID}`,
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORGANIZATION_UNIT_MEMBER_ALREADY_ASSIGNED');
  });

  it('refuses to remove someone from a unit they are not in', async () => {
    const response = await asMemberManager(
      'delete',
      `/api/v1/organization-units/${unitId}/members/${STAFF_USER_ID}`,
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORGANIZATION_UNIT_MEMBER_NOT_IN_UNIT');
  });

  it('refuses membership writes to a role that may only manage structure', async () => {
    // The assertion this whole suite exists for. This account can create and
    // rename units all day; it must not be able to move a single person.
    const assign = await asStructureOnly(
      'put',
      `/api/v1/organization-units/${unitId}/members/${STAFF_USER_ID}`,
    );
    const remove = await asStructureOnly(
      'delete',
      `/api/v1/organization-units/${otherUnitId}/members/${STAFF_USER_ID}`,
    );

    expect(assign.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('still lets that same role manage the structure itself', async () => {
    // The other half of the split: withholding the member grant must not have
    // taken away what the structure grant gives.
    const created = await asStructureOnly('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Structure Only Proof`,
      kind: 'TEAM',
    });

    expect(created.status).toBe(201);
  });

  it('lets a structure-only role read the roster', async () => {
    // Seeing the chart includes seeing who is on it.
    const response = await asStructureOnly(
      'get',
      `/api/v1/organization-units/${otherUnitId}/members`,
    );

    expect(response.status).toBe(200);
  });

  it('refuses to assign into an archived unit', async () => {
    await asMemberManager(
      'delete',
      `/api/v1/organization-units/${otherUnitId}/members/${STAFF_USER_ID}`,
    );
    const archivable = await asMemberManager('post', '/api/v1/organization-units').send({
      name: `${UNIT_NAME_PREFIX}Wound Down`,
      kind: 'TEAM',
    });
    const archivableId = archivable.body.data.id as string;
    await asMemberManager('post', `/api/v1/organization-units/${archivableId}/archive`);

    const response = await asMemberManager(
      'put',
      `/api/v1/organization-units/${archivableId}/members/${STAFF_USER_ID}`,
    );

    expect(response.status).toBe(404);
  });

  it('still lists the roster of an archived unit', async () => {
    const archived = await prisma.organizationUnit.findFirst({
      where: { name: `${UNIT_NAME_PREFIX}Wound Down` },
      select: { id: true },
    });

    const response = await asMemberManager(
      'get',
      `/api/v1/organization-units/${archived?.id}/members`,
    );

    expect(response.status).toBe(200);
  });
});
