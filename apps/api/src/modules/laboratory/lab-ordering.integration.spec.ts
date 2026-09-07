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
import { LabOrderRepository } from './repository/lab-order.repository';
import { LabSpecimenRepository } from './repository/lab-specimen.repository';

/**
 * Who reaches an order, and the lifecycle rules that hold at the HTTP edge
 * (`P18-T02`, `P18-T03`). The repositories are mocked: what is under test is
 * the guard chain and the refusals a client actually sees, not what Postgres
 * stores — the service specs cover the rules and the allocation integration
 * spec covers the counters.
 *
 * The scope matrix is the part worth having end to end. `lab-order.*:own`
 * resolves through the *encounter*, not through a row the guard can read, so a
 * doctor reaching another practitioner's visit is a failure only a request
 * through the real guard chain can catch.
 */
describe('Laboratory ordering integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let featureAvailabilityCache: FeatureAvailabilityCacheService;

  const attendingDoctorUserId = 'aaaa1111-2222-4333-8444-555566667777';
  const coveringDoctorUserId = 'bbbb1111-2222-4333-8444-555566667777';
  const analystUserId = 'cccc1111-2222-4333-8444-555566667777';
  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e';
  const labOrderId = 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f';
  const labTestId = '33333333-3333-4333-8333-333333333333';
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const labOrderRepositoryMock = {
    findEncounterForOrdering: jest.fn(),
    findLiveItemsByEncounterId: jest.fn(),
    createLabOrder: jest.fn(),
    findLabOrderById: jest.fn(),
    findLabOrdersByEncounterId: jest.fn(),
    findWorklistOrderById: jest.fn(),
    listLabOrders: jest.fn(),
    listWorklist: jest.fn(),
    cancelLabOrder: jest.fn(),
  };

  const labSpecimenRepositoryMock = {
    findLabSpecimenById: jest.fn(),
    collectLabSpecimens: jest.fn(),
    receiveLabSpecimen: jest.fn(),
    rejectLabSpecimen: jest.fn(),
  };

  const labCatalogRepositoryMock = {
    findActiveLabTestsByIds: jest.fn(),
    findActiveLabPanelsByIds: jest.fn(),
  };

  const disabledFeatureKeys: string[] = [];

  const prismaServiceMock = {
    featureEntitlement: {
      findMany: jest.fn(() =>
        Promise.resolve(disabledFeatureKeys.map((featureKey) => ({ featureKey, isEnabled: false }))),
      ),
    },
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const openEncounter = {
    id: encounterId,
    status: 'IN_PROGRESS' as const,
    patientId,
    doctorId,
    doctorOwnerUserId: attendingDoctorUserId,
    patientOwnerUserId: null,
  };

  function buildOrderRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: labOrderId,
      orderNumber: 'LAB/20260728/0001',
      encounterId,
      patientId,
      orderedById: doctorId,
      orderedByName: 'dr. Andi Wijaya',
      status: 'ORDERED' as const,
      priority: 'ROUTINE' as const,
      clinicalNotes: null,
      isFasting: false,
      recollectCount: 0,
      orderedAt: timestamp,
      cancelledAt: null,
      cancelReason: null,
      releasedAt: null,
      items: [],
      specimens: [],
      ...overrides,
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
      roles: [
        { role: { code: roleCode, permissions: permissions.map((p) => ({ permission: p })) } },
      ],
    });
  }

  const DOCTOR_PERMISSIONS = [
    { action: 'read', resource: 'LabOrder', scope: 'OWN' as const },
    { action: 'write', resource: 'LabOrder', scope: 'OWN' as const },
  ];
  const ANALYST_PERMISSIONS = [
    { action: 'read', resource: 'LabOrder', scope: 'ANY' as const },
    { action: 'write', resource: 'LabSpecimen', scope: 'ANY' as const },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(LabOrderRepository)
      .useValue(labOrderRepositoryMock)
      .overrideProvider(LabSpecimenRepository)
      .useValue(labSpecimenRepositoryMock)
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
    featureAvailabilityCache.invalidate();
    labOrderRepositoryMock.findEncounterForOrdering.mockResolvedValue(openEncounter);
    labOrderRepositoryMock.findLiveItemsByEncounterId.mockResolvedValue([]);
    labOrderRepositoryMock.createLabOrder.mockResolvedValue(buildOrderRecord());
    labCatalogRepositoryMock.findActiveLabTestsByIds.mockResolvedValue([{ id: labTestId }]);
    labCatalogRepositoryMock.findActiveLabPanelsByIds.mockResolvedValue([]);
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/lab-orders');

    expect(response.status).toBe(401);
  });

  it('lets the attending practitioner order on their own encounter', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/lab-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ testIds: [labTestId] });

    expect(response.status).toBe(201);
    expect(response.body.data.orderNumber).toBe('LAB/20260728/0001');
  });

  // The OWN rule the ticket names: a covering doctor who wants a test opens
  // their own encounter, exactly as they would to write a note.
  it('refuses doctor B ordering on doctor A’s encounter', async () => {
    const token = await buildToken(coveringDoctorUserId, 'dokter-b@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/lab-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ testIds: [labTestId] });

    expect(response.status).toBe(403);
    expect(labOrderRepositoryMock.createLabOrder).not.toHaveBeenCalled();
  });

  it('refuses an order with neither a test nor a panel on it', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/lab-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'URGENT' });

    expect(response.status).toBe(400);
    expect(labOrderRepositoryMock.createLabOrder).not.toHaveBeenCalled();
  });

  it('answers 409 naming the order a test is already on', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);
    labOrderRepositoryMock.findLiveItemsByEncounterId.mockResolvedValue([
      { labTestId, orderNumber: 'LAB/20260728/0001' },
    ]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/lab-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ testIds: [labTestId] });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('LAB/20260728/0001');
  });

  it('answers 409 when the visit is no longer in progress', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);
    labOrderRepositoryMock.findEncounterForOrdering.mockResolvedValue({
      ...openEncounter,
      status: 'FINISHED',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/lab-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ testIds: [labTestId] });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('FINISHED');
  });

  it('requires a reason to cancel', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(labOrderRepositoryMock.cancelLabOrder).not.toHaveBeenCalled();
  });

  it('answers 409 cancelling an order that has already been resulted', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
      buildOrderRecord({ status: 'RESULTED' }),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Salah input' });

    expect(response.status).toBe(409);
  });

  // The promise LAB_TECHNICIAN was added under: the analis reaches the bench
  // and nothing else. Ordering is not a bench act.
  it('refuses an analyst raising an order', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/encounters/${encounterId}/lab-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ testIds: [labTestId] });

    expect(response.status).toBe(403);
  });

  it('lets an analyst collect against an order', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
      buildOrderRecord({
        items: [
          {
            id: 'item-1',
            labTestId,
            code: 'HB',
            name: 'Hemoglobin',
            specimenType: 'WHOLE_BLOOD' as const,
            resultType: 'NUMERIC' as const,
            status: 'PENDING' as const,
            panelId: null,
            panelName: null,
            specimenId: null,
          },
        ],
      }),
    );
    labSpecimenRepositoryMock.collectLabSpecimens.mockResolvedValue([
      {
        id: 'specimen-1',
        labOrderId,
        specimenType: 'WHOLE_BLOOD' as const,
        accessionNumber: 'SPC/20260728/0001',
        collectedAt: timestamp,
        collectedById: analystUserId,
        receivedAt: null,
        status: 'COLLECTED' as const,
        rejectedAt: null,
        rejectReason: null,
        rejectNotes: null,
        notes: null,
      },
    ]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.data[0].accessionNumber).toBe('SPC/20260728/0001');
  });

  it('refuses a doctor collecting — a draw is a bench act', async () => {
    const token = await buildToken(attendingDoctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/collect`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(403);
    expect(labSpecimenRepositoryMock.collectLabSpecimens).not.toHaveBeenCalled();
  });

  it('rejects an unknown worklist bucket before it reaches the query', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/lab-worklist?bucket=whatever')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(labOrderRepositoryMock.listWorklist).not.toHaveBeenCalled();
  });

  it('serves the worklist bucket the analyst asked for', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);
    labOrderRepositoryMock.listWorklist.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/lab-worklist?bucket=to-collect')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(labOrderRepositoryMock.listWorklist.mock.calls[0][0].statuses).toEqual(['ORDERED']);
  });

  it.each([
    ['post', `/api/v1/v1/encounters/${encounterId}/lab-orders`],
    ['get', '/api/v1/v1/lab-orders'],
    ['get', '/api/v1/v1/lab-worklist?bucket=to-collect'],
  ])('refuses %s %s while the laboratory entitlement is off', async (method, path) => {
    const token = await buildToken(attendingDoctorUserId, 'admin@hms.local');
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'LabOrder', scope: 'ANY' },
      { action: 'write', resource: 'LabOrder', scope: 'ANY' },
    ]);
    disabledFeatureKeys.push('laboratory');
    featureAvailabilityCache.invalidate();

    const response = await (method === 'post'
      ? request(app.getHttpServer()).post(path).send({ testIds: [labTestId] })
      : request(app.getHttpServer()).get(path)
    ).set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
    expect(labOrderRepositoryMock.createLabOrder).not.toHaveBeenCalled();
  });
});
