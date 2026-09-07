import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { NotificationService } from '../notification/service/notification.service';
import { LabOrderRepository } from './repository/lab-order.repository';
import { LabResultRepository } from './repository/lab-result.repository';
import { LaboratorySettingsRepository } from './repository/laboratory-settings.repository';

/**
 * The refusals a client actually sees on the way to a released result
 * (`P18-T04`): a report signed out while a test is still pending, a value
 * verified by the person who typed it, and a technician signing where the
 * clinic has not said they may.
 *
 * The repositories are mocked — what is under test is the guard chain and the
 * status codes, not what Postgres stores. The versioning integration spec
 * covers the storage facts against a real database, and the service spec
 * covers the rules.
 */
describe('Laboratory results integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let featureAvailabilityCache: FeatureAvailabilityCacheService;

  const analystUserId = 'cccc1111-2222-4333-8444-555566667777';
  const doctorUserId = 'aaaa1111-2222-4333-8444-555566667777';
  const adminUserId = 'dddd1111-2222-4333-8444-555566667777';
  const encounterId = 'a3f1c9b2-5f9d-4a3b-9c7e-2b1a0d9f8e01';
  const patientId = '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002';
  const doctorId = '7b0c1e58-4f6a-4f6e-9d10-2a9c3f4b5d6e';
  const labOrderId = 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f';
  const labOrderItemId = '44444444-aaaa-4aaa-8aaa-444444444444';
  const labResultId = '77777777-dddd-4ddd-8ddd-777777777777';
  const timestamp = new Date('2026-07-28T03:00:00.000Z');

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };

  const labOrderRepositoryMock = {
    findLabOrderById: jest.fn(),
    findWorklistOrderById: jest.fn(),
  };

  const labResultRepositoryMock = {
    findEntryItemsByOrderId: jest.fn(),
    enterLabResults: jest.fn(),
    releaseLabOrder: jest.fn(),
    amendLabResult: jest.fn(),
    findLabResultById: jest.fn(),
    findResultsByOrderId: jest.fn(),
    findOrderIdByResultId: jest.fn(),
    findLatestVersionForItem: jest.fn(),
    listPatientLabResults: jest.fn(),
    listEncounterLabResults: jest.fn(),
    findOrderingDoctorUserId: jest.fn(),
    hasEncounterWithPatient: jest.fn(),
    isPatientOwner: jest.fn(),
  };

  const laboratorySettingsRepositoryMock = {
    findLaboratorySettings: jest.fn(),
    upsertLaboratorySettings: jest.fn(),
  };

  const notificationServiceMock = {
    createForUser: jest.fn(),
    createForUsers: jest.fn(),
    createForUsersWithPermission: jest.fn(),
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

  const ANALYST_PERMISSIONS = [
    { action: 'read', resource: 'LabOrder', scope: 'ANY' as const },
    { action: 'write', resource: 'LabResult', scope: 'ANY' as const },
    { action: 'verify', resource: 'LabResult', scope: 'ANY' as const },
  ];
  const DOCTOR_PERMISSIONS = [
    { action: 'read', resource: 'LabOrder', scope: 'OWN' as const },
    { action: 'verify', resource: 'LabResult', scope: 'ANY' as const },
  ];
  const ADMIN_PERMISSIONS = [
    ...ANALYST_PERMISSIONS,
    { action: 'read', resource: 'LaboratorySettings', scope: 'ANY' as const },
    { action: 'write', resource: 'LaboratorySettings', scope: 'ANY' as const },
  ];

  function buildToken(sub: string, email: string): Promise<string> {
    return jwtService.signAsync({ sub, email }, { secret: 'dev-access-secret' });
  }

  function mockActorWithPermissions(
    roleName: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): void {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'actor-user',
      roles: [
        {
          role: {
            code: roleName,
            name: roleName,
            permissions: permissions.map((permission) => ({ permission })),
          },
        },
      ],
    });
  }

  function buildItem(status: 'PENDING' | 'RESULTED') {
    return {
      id: labOrderItemId,
      labTestId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      code: 'HB',
      name: 'Hemoglobin',
      specimenType: 'WHOLE_BLOOD' as const,
      resultType: 'NUMERIC' as const,
      status,
      panelId: null,
      panelName: null,
      specimenId: 'ffffffff-6666-4666-8666-ffffffffffff',
    };
  }

  function buildOrderRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: labOrderId,
      orderNumber: 'LAB/20260728/0001',
      encounterId,
      patientId,
      orderedById: doctorId,
      orderedByName: 'dr. Andi Wijaya',
      status: 'COLLECTED' as const,
      priority: 'ROUTINE' as const,
      clinicalNotes: null,
      isFasting: false,
      fulfilmentSite: 'INTERNAL' as const,
      chargeMode: 'CLINIC' as const,
      externalFacilityName: null,
      recollectCount: 0,
      orderedAt: timestamp,
      cancelledAt: null,
      cancelReason: null,
      releasedAt: null,
      items: [buildItem('PENDING')],
      specimens: [],
      ...overrides,
    };
  }

  function buildWorklistOrder() {
    return {
      ...buildOrderRecord(),
      itemCount: 1,
      orderedByLicenseNumber: null,
      patient: {
        id: patientId,
        fullName: 'Siti Rahayu',
        mrn: 'MRN00000123',
        dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
        sex: 'FEMALE' as const,
        bpjsNumberIndex: null,
      },
      specimens: [
        {
          id: 'ffffffff-6666-4666-8666-ffffffffffff',
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
      ],
    };
  }

  function buildEntryItem() {
    return {
      id: labOrderItemId,
      status: 'PENDING' as const,
      labTest: {
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        code: 'HB',
        name: 'Hemoglobin',
        unit: 'g/dL',
        resultType: 'NUMERIC' as const,
        codedOptions: [],
        referenceRanges: [
          {
            id: 'range-adult-female',
            sex: 'FEMALE' as const,
            ageMinDays: null,
            ageMaxDays: null,
            low: { toNumber: () => 12 },
            high: { toNumber: () => 16 },
            criticalLow: { toNumber: () => 7 },
            criticalHigh: { toNumber: () => 20 },
            textNormal: null,
          },
        ],
      },
      specimen: { collectedAt: timestamp },
      results: [],
    };
  }

  function buildResultRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: labResultId,
      labOrderItemId,
      version: 1,
      valueNumeric: 6.8,
      valueText: null,
      valueCoded: null,
      unit: 'g/dL',
      refLow: 12,
      refHigh: 16,
      refCriticalLow: 7,
      refCriticalHigh: 20,
      refText: null,
      flag: 'CRITICAL_LOW' as const,
      enteredById: analystUserId,
      enteredAt: timestamp,
      verifiedById: null,
      verifiedAt: null,
      verifiedUnderSingleOperator: false,
      amendedFromId: null,
      amendReason: null,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(LabOrderRepository)
      .useValue(labOrderRepositoryMock)
      .overrideProvider(LabResultRepository)
      .useValue(labResultRepositoryMock)
      .overrideProvider(LaboratorySettingsRepository)
      .useValue(laboratorySettingsRepositoryMock)
      .overrideProvider(NotificationService)
      .useValue(notificationServiceMock)
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
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(buildOrderRecord());
    labOrderRepositoryMock.findWorklistOrderById.mockResolvedValue(buildWorklistOrder());
    labResultRepositoryMock.findEntryItemsByOrderId.mockResolvedValue([buildEntryItem()]);
    labResultRepositoryMock.enterLabResults.mockResolvedValue([buildResultRecord()]);
    labResultRepositoryMock.findResultsByOrderId.mockResolvedValue([buildResultRecord()]);
    labResultRepositoryMock.findOrderingDoctorUserId.mockResolvedValue(doctorUserId);
    laboratorySettingsRepositoryMock.findLaboratorySettings.mockResolvedValue(null);
  });

  it('returns 401 without a bearer token', async () => {
    const response = await request(app.getHttpServer()).put(
      `/api/v1/v1/lab-orders/${labOrderId}/results`,
    );

    expect(response.status).toBe(401);
  });

  it('lets an analyst enter a worksheet and flags the value on the way in', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/v1/lab-orders/${labOrderId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ labOrderItemId, valueNumeric: 6.8 }] });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].flag).toBe('CRITICAL_LOW');
  });

  // The rule the ticket is written around: a value that has to be telephoned
  // does not wait for a second signature.
  it('rings the ordering doctor on entry, before anything is released', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);

    await request(app.getHttpServer())
      .put(`/api/v1/v1/lab-orders/${labOrderId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ labOrderItemId, valueNumeric: 6.8 }] });

    expect(notificationServiceMock.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LAB_RESULT_CRITICAL', userId: doctorUserId }),
    );
    expect(labResultRepositoryMock.releaseLabOrder).not.toHaveBeenCalled();
  });

  it('refuses to release while a test is still waiting for a value', async () => {
    const token = await buildToken(doctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
      buildOrderRecord({ status: 'RESULTED' }),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/release`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
  });

  it('refuses the analyst who typed the value as its second signature', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_PERMISSIONS);
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
      buildOrderRecord({ status: 'RESULTED', items: [buildItem('RESULTED')] }),
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/release`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('lets one operator do both where the clinic runs single-operator', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_PERMISSIONS);
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
      buildOrderRecord({ status: 'RESULTED', items: [buildItem('RESULTED')] }),
    );
    laboratorySettingsRepositoryMock.findLaboratorySettings.mockResolvedValue({
      technicianMayVerify: true,
      singleOperator: true,
      updatedById: adminUserId,
      updatedAt: timestamp,
    });
    labResultRepositoryMock.releaseLabOrder.mockResolvedValue([
      buildResultRecord({ verifiedById: analystUserId, verifiedUnderSingleOperator: true }),
    ]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/release`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    // Asserted on the write rather than on the response, because the response
    // is re-read through the same mocked repository: what matters is that the
    // rule in force reached the row.
    expect(labResultRepositoryMock.releaseLabOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedById: analystUserId,
        verifiedUnderSingleOperator: true,
      }),
    );
  });

  it('refuses a technician signing out where the clinic has not said they may', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);
    labOrderRepositoryMock.findLabOrderById.mockResolvedValue(
      buildOrderRecord({ status: 'RESULTED', items: [buildItem('RESULTED')] }),
    );
    labResultRepositoryMock.findResultsByOrderId.mockResolvedValue([
      buildResultRecord({ enteredById: 'somebody-else' }),
    ]);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-orders/${labOrderId}/release`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('refuses an amendment with no reason', async () => {
    const token = await buildToken(doctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/v1/lab-results/${labResultId}/amend`)
      .set('Authorization', `Bearer ${token}`)
      .send({ valueNumeric: 8.6 });

    expect(response.status).toBe(400);
  });

  it('hides every result route behind the laboratory entitlement', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);
    disabledFeatureKeys.push('laboratory');
    featureAvailabilityCache.invalidate();

    const response = await request(app.getHttpServer())
      .put(`/api/v1/v1/lab-orders/${labOrderId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ labOrderItemId, valueNumeric: 6.8 }] });

    expect(response.status).toBe(403);
  });

  it('refuses to enter a result without the write key, even holding verify', async () => {
    const token = await buildToken(doctorUserId, 'dokter@hms.local');
    mockActorWithPermissions('DOCTOR', DOCTOR_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/v1/lab-orders/${labOrderId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ labOrderItemId, valueNumeric: 6.8 }] });

    expect(response.status).toBe(403);
  });

  it('refuses the bench the settings that judge it', async () => {
    const token = await buildToken(analystUserId, 'analis@hms.local');
    mockActorWithPermissions('LAB_TECHNICIAN', ANALYST_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .patch('/api/v1/v1/laboratory/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ singleOperator: true });

    expect(response.status).toBe(403);
  });

  it('reads the strict defaults for a clinic that has never set them', async () => {
    const token = await buildToken(adminUserId, 'admin@hms.local');
    mockActorWithPermissions('ADMIN', ADMIN_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/laboratory/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({ technicianMayVerify: false, singleOperator: false }),
    );
  });
});
