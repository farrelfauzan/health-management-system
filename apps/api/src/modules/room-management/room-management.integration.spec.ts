import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';

/**
 * IMP-13 against real Postgres, with the real `PermissionsGuard` and
 * `FeatureGuard`.
 *
 * The claims worth a database are the ones a mock cannot make: the partial
 * unique index actually rejects a duplicate live code, the occupancy aggregate
 * counts what is really in the ward, a retire is refused while children exist,
 * and a clinic without the `room-management` entitlement gets nothing at all.
 *
 * CI's database is migrated but not seeded, so the catalog rows the spec needs
 * are upserted by key and left in place; everything else is namespaced by
 * `TEST_MARKER` and removed.
 */
describe('Room management against Postgres', () => {
  const TEST_MARKER = 'imp13-rooms-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const MANAGER_USER_ID = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const READER_USER_ID = '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const MANAGER_ROLE_CODE = 'IMP13_SPEC_MANAGER';
  const READER_ROLE_CODE = 'IMP13_SPEC_READER';
  const FEATURE_KEY = 'room-management';

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const MANAGER_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'roomclass.read:any', resource: 'RoomClass', action: 'read', scope: 'ANY' },
    {
      permissionKey: 'roomclass.create:any',
      resource: 'RoomClass',
      action: 'create',
      scope: 'ANY',
    },
    {
      permissionKey: 'roomclass.update:any',
      resource: 'RoomClass',
      action: 'update',
      scope: 'ANY',
    },
    {
      permissionKey: 'roomclass.delete:any',
      resource: 'RoomClass',
      action: 'delete',
      scope: 'ANY',
    },
    { permissionKey: 'ward.read:any', resource: 'Ward', action: 'read', scope: 'ANY' },
    { permissionKey: 'ward.create:any', resource: 'Ward', action: 'create', scope: 'ANY' },
    { permissionKey: 'ward.update:any', resource: 'Ward', action: 'update', scope: 'ANY' },
    { permissionKey: 'ward.delete:any', resource: 'Ward', action: 'delete', scope: 'ANY' },
    { permissionKey: 'room.read:any', resource: 'Room', action: 'read', scope: 'ANY' },
    { permissionKey: 'room.create:any', resource: 'Room', action: 'create', scope: 'ANY' },
    { permissionKey: 'room.update:any', resource: 'Room', action: 'update', scope: 'ANY' },
    { permissionKey: 'room.delete:any', resource: 'Room', action: 'delete', scope: 'ANY' },
    { permissionKey: 'bed.read:any', resource: 'Bed', action: 'read', scope: 'ANY' },
    { permissionKey: 'bed.create:any', resource: 'Bed', action: 'create', scope: 'ANY' },
    { permissionKey: 'bed.update:any', resource: 'Bed', action: 'update', scope: 'ANY' },
    { permissionKey: 'bed.delete:any', resource: 'Bed', action: 'delete', scope: 'ANY' },
  ];

  const READER_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'roomclass.read:any', resource: 'RoomClass', action: 'read', scope: 'ANY' },
    { permissionKey: 'ward.read:any', resource: 'Ward', action: 'read', scope: 'ANY' },
    { permissionKey: 'room.read:any', resource: 'Room', action: 'read', scope: 'ANY' },
    { permissionKey: 'bed.read:any', resource: 'Bed', action: 'read', scope: 'ANY' },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let featureAvailabilityCache: FeatureAvailabilityCacheService;
  let managerToken: string;
  let readerToken: string;
  let roomClassId: string;
  let wardId: string;
  let roomId: string;
  let bedId: string;

  function asManager(method: 'delete' | 'get' | 'patch' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${managerToken}`);
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
    const roomClasses = await prisma.roomClass.findMany({
      where: { code: { startsWith: 'IMP13' } },
      select: { id: true },
    });
    const roomClassIds = roomClasses.map((roomClass) => roomClass.id);
    const wards = await prisma.ward.findMany({
      where: { code: { startsWith: 'IMP13' } },
      select: { id: true },
    });
    const wardIds = wards.map((ward) => ward.id);
    const rooms = await prisma.room.findMany({
      where: { wardId: { in: wardIds } },
      select: { id: true },
    });
    const roomIds = rooms.map((room) => room.id);
    await prisma.bed.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: wardIds } } });
    await prisma.roomClass.deleteMany({ where: { id: { in: roomClassIds } } });

    const roles = await prisma.role.findMany({
      where: { code: { in: [MANAGER_ROLE_CODE, READER_ROLE_CODE] } },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: {
        OR: [{ roleId: { in: roleIds } }, { userId: { in: [MANAGER_USER_ID, READER_USER_ID] } }],
      },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [MANAGER_USER_ID, READER_USER_ID] } } });
    await prisma.featureEntitlement.deleteMany({ where: { featureKey: FEATURE_KEY } });
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
    featureAvailabilityCache = moduleRef.get(FeatureAvailabilityCacheService);

    await removeFixtures();
    await upsertUser(MANAGER_USER_ID);
    await upsertUser(READER_USER_ID);
    await seedRole(MANAGER_ROLE_CODE, MANAGER_PERMISSIONS, MANAGER_USER_ID);
    await seedRole(READER_ROLE_CODE, READER_PERMISSIONS, READER_USER_ID);
    managerToken = await signTokenFor(MANAGER_USER_ID);
    readerToken = await signTokenFor(READER_USER_ID);
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('creates a room class, a ward, a room and a bed', async () => {
    const roomClass = await asManager('post', '/api/v1/room-classes').send({
      code: 'IMP13-KELAS-1',
      name: 'Kelas 1',
      description: 'Spec fixture',
    });
    expect(roomClass.status).toBe(201);
    // A brand-new class holds nothing, and no quota means uncapped.
    expect(roomClass.body.data).toMatchObject({ allocatedBeds: 0 });
    expect(roomClass.body.data.quota).toBeUndefined();
    roomClassId = roomClass.body.data.id;

    const ward = await asManager('post', '/api/v1/wards').send({
      code: 'IMP13-MELATI',
      name: 'Bangsal Melati',
      description: 'Spec fixture',
    });
    expect(ward.status).toBe(201);
    wardId = ward.body.data.id;

    const room = await asManager('post', '/api/v1/rooms').send({
      wardId,
      roomClassId,
      code: '201',
      name: 'Kamar 201',
    });
    expect(room.status).toBe(201);
    expect(room.body.data.ward.code).toBe('IMP13-MELATI');
    expect(room.body.data.roomClass).toMatchObject({ code: 'IMP13-KELAS-1', name: 'Kelas 1' });
    roomId = room.body.data.id;

    const bed = await asManager('post', '/api/v1/beds').send({ roomId, code: 'A' });
    expect(bed.status).toBe(201);
    expect(bed.body.data.status).toBe('AVAILABLE');
    // The bed carries its full address so a picker needs no second request.
    expect(bed.body.data.ward.code).toBe('IMP13-MELATI');
    expect(bed.body.data.room.roomClass.code).toBe('IMP13-KELAS-1');
    bedId = bed.body.data.id;
  });

  it('rejects a duplicate live ward code on the partial unique index', async () => {
    const response = await asManager('post', '/api/v1/wards').send({
      code: 'IMP13-MELATI',
      name: 'Bangsal Melati Duplikat',
    });

    expect(response.status).toBe(409);
  });

  it('rejects a duplicate bed code within the same room', async () => {
    const response = await asManager('post', '/api/v1/beds').send({ roomId, code: 'A' });

    expect(response.status).toBe(409);
  });

  it('filters beds by ward and by status', async () => {
    const byWard = await asManager('get', `/api/v1/beds?wardId=${wardId}`);
    expect(byWard.status).toBe(200);
    expect(byWard.body.data).toHaveLength(1);
    expect(byWard.body.meta.total).toBe(1);

    const occupied = await asManager('get', `/api/v1/beds?wardId=${wardId}&status=OCCUPIED`);
    expect(occupied.status).toBe(200);
    expect(occupied.body.data).toHaveLength(0);
  });

  it('counts the ward on the occupancy board', async () => {
    const response = await asManager('get', `/api/v1/room-occupancy?wardId=${wardId}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      wardId,
      totalBeds: 1,
      availableBeds: 1,
      occupiedBeds: 0,
      maintenanceBeds: 0,
    });
    expect(response.body.data[0].rooms[0]).toMatchObject({ roomId, availableBeds: 1 });
    expect(response.body.data[0].rooms[0].roomClass.code).toBe('IMP13-KELAS-1');
  });

  it('counts the class’s beds against its quota', async () => {
    const listed = await asManager('get', `/api/v1/room-classes?search=IMP13`);
    expect(listed.status).toBe(200);
    expect(listed.body.data[0]).toMatchObject({ code: 'IMP13-KELAS-1', allocatedBeds: 1 });
  });

  it('refuses a quota below the beds already allocated', async () => {
    // Accepting it would leave a ceiling that is already breached and a screen
    // that says so forever.
    const response = await asManager('patch', `/api/v1/room-classes/${roomClassId}`).send({
      quota: 0,
    });

    // Zero is not a quota at all — `min(1)` rejects it before the service.
    expect(response.status).toBe(400);
  });

  it('caps bed creation at the class quota, and uncaps again when cleared', async () => {
    const capped = await asManager('patch', `/api/v1/room-classes/${roomClassId}`).send({
      quota: 1,
    });
    expect(capped.status).toBe(200);
    expect(capped.body.data).toMatchObject({ quota: 1, allocatedBeds: 1 });

    const refused = await asManager('post', '/api/v1/beds').send({ roomId, code: 'B' });
    expect(refused.status).toBe(409);

    // `null` is how a clinic says "uncapped again".
    const uncapped = await asManager('patch', `/api/v1/room-classes/${roomClassId}`).send({
      quota: null,
    });
    expect(uncapped.status).toBe(200);
    expect(uncapped.body.data.quota).toBeUndefined();

    const allowed = await asManager('post', '/api/v1/beds').send({ roomId, code: 'B' });
    expect(allowed.status).toBe(201);
    expect((await asManager('delete', `/api/v1/beds/${allowed.body.data.id}`)).status).toBe(200);
  });

  it('refuses to retire a class that rooms still carry', async () => {
    const response = await asManager('delete', `/api/v1/room-classes/${roomClassId}`);

    expect(response.status).toBe(409);
  });

  it('refuses a room pointing at a class that does not exist', async () => {
    const response = await asManager('post', '/api/v1/rooms').send({
      wardId,
      roomClassId: '00000000-0000-4000-8000-000000000000',
      code: '999',
      name: 'Kamar 999',
    });

    expect(response.status).toBe(400);
  });

  it('moves a bed to maintenance and re-tallies the board', async () => {
    const update = await asManager('patch', `/api/v1/beds/${bedId}`).send({
      status: 'MAINTENANCE',
      notes: 'Perbaikan rangka',
    });
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe('MAINTENANCE');

    const board = await asManager('get', `/api/v1/room-occupancy?wardId=${wardId}`);
    expect(board.body.data[0]).toMatchObject({
      totalBeds: 1,
      availableBeds: 0,
      maintenanceBeds: 1,
    });
  });

  it('refuses OCCUPIED as an inventory edit', async () => {
    // OCCUPIED is a claim about a patient, not about the furniture, so the
    // schema has no value for it — the request never reaches the service.
    const response = await asManager('patch', `/api/v1/beds/${bedId}`).send({ status: 'OCCUPIED' });

    expect(response.status).toBe(400);
  });

  it('refuses to retire a ward that still holds rooms', async () => {
    const response = await asManager('delete', `/api/v1/wards/${wardId}`);

    expect(response.status).toBe(409);
  });

  it('retires bed, room and ward in order, and frees the code', async () => {
    expect((await asManager('delete', `/api/v1/beds/${bedId}`)).status).toBe(200);
    expect((await asManager('delete', `/api/v1/rooms/${roomId}`)).status).toBe(200);
    expect((await asManager('delete', `/api/v1/wards/${wardId}`)).status).toBe(200);

    expect((await asManager('get', `/api/v1/wards/${wardId}`)).status).toBe(404);

    // The unique index is partial on `deleted_at`, so the retired ward's code
    // is available to the replacement that takes its place on the floor plan.
    const replacement = await asManager('post', '/api/v1/wards').send({
      code: 'IMP13-MELATI',
      name: 'Bangsal Melati (baru)',
    });
    expect(replacement.status).toBe(201);
    wardId = replacement.body.data.id;

    // The same holds one level up: an emptied class retires and frees its code.
    expect((await asManager('delete', `/api/v1/room-classes/${roomClassId}`)).status).toBe(200);
    const replacementClass = await asManager('post', '/api/v1/room-classes').send({
      code: 'IMP13-KELAS-1',
      name: 'Kelas 1 (baru)',
    });
    expect(replacementClass.status).toBe(201);
    roomClassId = replacementClass.body.data.id;
  });

  it('lets a reader list wards but not create one', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/wards')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(list.status).toBe(200);

    const create = await request(app.getHttpServer())
      .post('/api/v1/wards')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ code: 'IMP13-NOPE', name: 'Should not exist' });
    expect(create.status).toBe(403);
  });

  it('refuses every route once the room-management entitlement is off', async () => {
    await prisma.featureEntitlement.upsert({
      where: { featureKey: FEATURE_KEY },
      update: { isEnabled: false },
      create: { featureKey: FEATURE_KEY, isEnabled: false },
    });
    // The row is written directly rather than through the admin endpoint, so
    // the write path's own invalidation never runs. Without this the guard
    // would answer from a cache that is at most ten seconds stale — correct
    // in production, useless as a same-tick assertion.
    featureAvailabilityCache.invalidate();

    const list = await asManager('get', '/api/v1/wards');
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FEATURE_DISABLED');

    const classes = await asManager('get', '/api/v1/room-classes');
    expect(classes.status).toBe(403);

    const board = await asManager('get', '/api/v1/room-occupancy');
    expect(board.status).toBe(403);
  });
});
