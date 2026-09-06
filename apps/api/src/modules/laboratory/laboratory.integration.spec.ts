import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { LabCatalogRepository } from './repository/lab-catalog.repository';

/**
 * The permission matrix and the entitlement gate, which are the two ways a
 * laboratory route is refused (`P18-T01`). The repository is mocked: what is
 * under test is who reaches the catalog, not what the catalog contains — the
 * seed spec covers that.
 */
describe('Laboratory catalog integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let featureAvailabilityCache: FeatureAvailabilityCacheService;

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const labCatalogRepositoryMock = {
    listLabTests: jest.fn(),
    findLabTestById: jest.fn(),
    findLabTestByCode: jest.fn(),
    createLabTest: jest.fn(),
    updateLabTest: jest.fn(),
    replaceReferenceRanges: jest.fn(),
    listLabPanels: jest.fn(),
    findLabPanelById: jest.fn(),
    findLabPanelByCode: jest.fn(),
    countActiveLabTests: jest.fn(),
    createLabPanel: jest.fn(),
    updateLabPanel: jest.fn(),
  };

  const disabledFeatureKeys: string[] = [];

  const prismaServiceMock = {
    // IMP-8: `FeatureGuard` resolves the entitlement through Prisma on every
    // request, and this stub replaces Prisma wholesale. Returning rows from a
    // mutable list is what lets one test switch `laboratory` off.
    featureEntitlement: {
      findMany: jest.fn(() =>
        Promise.resolve(disabledFeatureKeys.map((featureKey) => ({ featureKey, isEnabled: false }))),
      ),
    },
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const labTestId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const timestamp = new Date('2026-07-20T08:00:00.000Z');

  function buildLabTestRecord() {
    return {
      id: labTestId,
      code: 'HB',
      name: 'Hemoglobin',
      loincCode: '718-7',
      loincDisplay: 'Hemoglobin [Mass/volume] in Blood',
      specimenType: 'WHOLE_BLOOD' as const,
      resultType: 'NUMERIC' as const,
      unit: 'g/dL',
      decimals: 1,
      codedOptions: [],
      isActive: true,
      serviceTariffId: null,
      price: null,
      referenceRanges: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    roleCode: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [{ role: { code: roleCode, permissions: permissions.map((p) => ({ permission: p })) } }],
    });
  }

  const READ_ONLY = [{ action: 'read', resource: 'LabTest', scope: 'ANY' as const }];
  const READ_WRITE = [
    ...READ_ONLY,
    { action: 'write', resource: 'LabTest', scope: 'ANY' as const },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(LabCatalogRepository)
      .useValue(labCatalogRepositoryMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    jwtService = moduleRef.get(JwtService);
    featureAvailabilityCache = moduleRef.get(FeatureAvailabilityCacheService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    disabledFeatureKeys.length = 0;
    prismaServiceMock.featureEntitlement.findMany.mockImplementation(() =>
      Promise.resolve(disabledFeatureKeys.map((featureKey) => ({ featureKey, isEnabled: false }))),
    );
    // The guard's cache holds the disabled set on a TTL, so a test that flips
    // an entitlement has to drop it — exactly as the admin write path does.
    featureAvailabilityCache.invalidate();
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/lab-tests');

    expect(response.status).toBe(401);
  });

  it('lets a LAB_TECHNICIAN read the catalog', async () => {
    const token = await buildToken('actor-user', 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', READ_ONLY);
    labCatalogRepositoryMock.listLabTests.mockResolvedValue([buildLabTestRecord()]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].code).toBe('HB');
  });

  it('refuses a LAB_TECHNICIAN writing the catalog — running a test is not deciding what is offered', async () => {
    const token = await buildToken('actor-user', 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', READ_ONLY);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X', name: 'X', specimenType: 'SERUM', resultType: 'TEXT' });

    expect(response.status).toBe(403);
    expect(labCatalogRepositoryMock.createLabTest).not.toHaveBeenCalled();
  });

  it('lets a DOCTOR read the catalog they order from', async () => {
    const token = await buildToken('actor-user', 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', READ_ONLY);
    labCatalogRepositoryMock.listLabTests.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it('lets an ADMIN create a test', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', READ_WRITE);
    labCatalogRepositoryMock.findLabTestByCode.mockResolvedValue(null);
    labCatalogRepositoryMock.createLabTest.mockResolvedValue(buildLabTestRecord());

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'HB',
        name: 'Hemoglobin',
        specimenType: 'WHOLE_BLOOD',
        resultType: 'NUMERIC',
        unit: 'g/dL',
        decimals: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.code).toBe('HB');
  });

  it('rejects a numeric test with no unit before it reaches the database', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', READ_WRITE);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X', name: 'X', specimenType: 'SERUM', resultType: 'NUMERIC' });

    expect(response.status).toBe(400);
    expect(labCatalogRepositoryMock.createLabTest).not.toHaveBeenCalled();
  });

  it('rejects a coded test with no options', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', READ_WRITE);

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X', name: 'X', specimenType: 'SERUM', resultType: 'CODED' });

    expect(response.status).toBe(400);
  });

  it('answers 409 on a duplicate code', async () => {
    const token = await buildToken('actor-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', READ_WRITE);
    labCatalogRepositoryMock.findLabTestByCode.mockResolvedValue(buildLabTestRecord());

    const response = await request(app.getHttpServer())
      .post('/api/v1/v1/lab-tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'HB', name: 'Hemoglobin', specimenType: 'SERUM', resultType: 'TEXT' });

    expect(response.status).toBe(409);
  });

  it.each(['/api/v1/v1/lab-tests', '/api/v1/v1/lab-panels'])(
    'refuses GET %s while the laboratory entitlement is off',
    async (path) => {
      const token = await buildToken('actor-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', READ_WRITE);
      disabledFeatureKeys.push('laboratory');
      featureAvailabilityCache.invalidate();

      const response = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`);

      // 403 FEATURE_DISABLED, which is what `FeatureGuard` answers repo-wide
      // (IMP-8) — the ticket sketched 404, but a client that cannot tell
      // "not in your plan" from "no such route" cannot render the upsell.
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FEATURE_DISABLED');
      expect(labCatalogRepositoryMock.listLabTests).not.toHaveBeenCalled();
      expect(labCatalogRepositoryMock.listLabPanels).not.toHaveBeenCalled();
    },
  );
});
