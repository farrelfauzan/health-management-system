import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SatusehatLocationClient } from '../../common/satusehat/satusehat-location.client';
import { SatusehatError } from '../../common/satusehat/satusehat.error';
import { AuthRepository } from '../auth/repository/auth.repository';
import { SatusehatLocationRepository } from './repository/satusehat-location.repository';

describe('SATUSEHAT Location tree (P24-T06)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const locationRepositoryMock = { findLocationSources: jest.fn(), saveLocationId: jest.fn() };
  const locationClientMock = {
    findLocationIdByIdentifier: jest.fn(),
    createLocation: jest.fn(),
    updateLocation: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = {
    // FeatureGuard resolves the `satusehat` entitlement through Prisma on every
    // request; no rows means nothing is disabled.
    featureEntitlement: { findMany: jest.fn(() => Promise.resolve([])) },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
  const siteId = '4f1c2a9e-6b3d-4e8a-9c7f-1a2b3c4d5e6f';
  const poliId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const wardId = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
  const roomId = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
  const bedId = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [{ role: { code: 'ADMIN', permissions: permissions.map((permission) => ({ permission })) } }],
    });
  }

  function mockDemoTree(): void {
    locationRepositoryMock.findLocationSources.mockResolvedValue({
      clinic: { id: siteId, name: 'Klinik', latitude: -6.1754, longitude: 106.8272, satusehatLocationId: 'ihs-site' },
      specialties: [{ id: poliId, name: 'Poli KIA', isActive: true, isDeleted: false, satusehatLocationId: null }],
      wards: [{ id: wardId, code: 'MEL', name: 'Bangsal Melati', isActive: true, isDeleted: false, satusehatLocationId: null }],
      rooms: [
        {
          id: roomId,
          wardId,
          code: 'MEL-01',
          name: 'Kamar 1',
          isActive: true,
          isDeleted: false,
          satusehatLocationId: null,
          roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' },
        },
      ],
      beds: [{ id: bedId, roomId, code: 'B1', isDeleted: false, satusehatLocationId: null }],
    });
  }

  // The three credentials must be set together or not at all
  // (`resolveSatusehatConfig`), and CI sets none of them. The client itself is
  // mocked, so these only give the registration service an organization id.
  const satusehatCredentialKeys = [
    'SATUSEHAT_ORGANIZATION_ID',
    'SATUSEHAT_CLIENT_ID',
    'SATUSEHAT_CLIENT_SECRET',
  ] as const;
  const previousCredentials = Object.fromEntries(
    satusehatCredentialKeys.map((key) => [key, process.env[key]]),
  );

  beforeAll(async () => {
    process.env.SATUSEHAT_ORGANIZATION_ID = '10000004';
    process.env.SATUSEHAT_CLIENT_ID = 'spec-client-id';
    process.env.SATUSEHAT_CLIENT_SECRET = 'spec-client-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(SatusehatLocationRepository)
      .useValue(locationRepositoryMock)
      .overrideProvider(SatusehatLocationClient)
      .useValue(locationClientMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    for (const key of satusehatCredentialKeys) {
      if (previousCredentials[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousCredentials[key];
      }
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDemoTree();
    locationClientMock.findLocationIdByIdentifier.mockResolvedValue(null);
    locationClientMock.createLocation.mockImplementation((resource: { identifier: { value: string }[] }) =>
      Promise.resolve(`ihs-${resource.identifier[0]?.value}`),
    );
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/satusehat/locations');

    expect(response.status).toBe(401);
  });

  it('returns 403 without satusehat.location.read', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'SatusehatSubmission', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/locations')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns the tree parents first, with a child of an unregistered parent BLOCKED', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'SatusehatLocation', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/satusehat/locations')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const nodes = response.body.data.nodes as Array<{ id: string; status: string; blockReason: string | null }>;
    expect(nodes.map((node) => node.id)).toEqual([siteId, poliId, wardId, roomId, bedId]);
    expect(nodes.map((node) => node.status)).toEqual(['REGISTERED', 'UNREGISTERED', 'UNREGISTERED', 'BLOCKED', 'BLOCKED']);
    expect(nodes[3]?.blockReason).toBe('UNREGISTERED_PARENT');
  });

  it('refuses to register without satusehat.location.write', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'read', resource: 'SatusehatLocation', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/locations/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ all: true });

    expect(response.status).toBe(403);
    expect(locationClientMock.createLocation).not.toHaveBeenCalled();
  });

  it('rejects a request that names nothing', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'SatusehatLocation', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/locations/register')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it('registers everything unregistered in order and audits each write (US-LOC-01)', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'SatusehatLocation', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/locations/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ all: true });

    expect(response.status).toBe(200);
    expect(response.body.data.outcomes.map((outcome: { outcome: string }) => outcome.outcome)).toEqual([
      'CREATED',
      'CREATED',
      'CREATED',
      'CREATED',
    ]);
    expect(locationRepositoryMock.saveLocationId).toHaveBeenCalledTimes(4);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SATUSEHAT_LOCATION_REGISTERED', actorUserId: 'actor-user' }),
    );
  });

  it('stops the batch on an open breaker and reports progress', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'SatusehatLocation', scope: 'ANY' }]);
    locationClientMock.createLocation
      .mockResolvedValueOnce('ihs-poli')
      .mockRejectedValueOnce(new SatusehatError('SATUSEHAT_CIRCUIT_OPEN', 'SATUSEHAT circuit breaker is open'));

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/locations/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ all: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.objectContaining({ processedCount: 1, stoppedEarly: true }));
  });

  it('pushes a soft-deleted registered ward as status inactive (FR-LOC-08)', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions([{ action: 'write', resource: 'SatusehatLocation', scope: 'ANY' }]);
    locationRepositoryMock.findLocationSources.mockResolvedValue({
      clinic: { id: siteId, name: 'Klinik', latitude: -6.1754, longitude: 106.8272, satusehatLocationId: 'ihs-site' },
      specialties: [],
      wards: [{ id: wardId, code: 'MEL', name: 'Bangsal Melati', isActive: true, isDeleted: true, satusehatLocationId: 'ihs-ward' }],
      rooms: [],
      beds: [],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/satusehat/locations/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ targets: [{ kind: 'WARD', id: wardId }] });

    expect(response.status).toBe(200);
    expect(locationClientMock.updateLocation).toHaveBeenCalledWith(
      'ihs-ward',
      expect.objectContaining({ status: 'inactive' }),
    );
  });
});
