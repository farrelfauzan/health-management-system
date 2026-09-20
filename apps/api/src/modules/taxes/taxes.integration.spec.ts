import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { ClinicProfileRepository } from '../billing/repository/clinic-profile.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { TaxAssignmentRepository } from './repository/tax-assignment.repository';
import { TaxCodeRepository } from './repository/tax-code.repository';
import { TaxSettingsRepository } from './repository/tax-settings.repository';

const TAX_SETTINGS_PATH = '/api/v1/v1/tax/settings';
const TAX_CODES_PATH = '/api/v1/v1/tax/codes';
const TAX_ASSIGNMENTS_PATH = '/api/v1/v1/tax/assignments';
const TAX_CODE_PERMISSIONS = [
  { action: 'read', resource: 'TaxCode', scope: 'ANY' as const },
  { action: 'write', resource: 'TaxCode', scope: 'ANY' as const },
];
const TAX_SETTINGS_PERMISSIONS = [
  { action: 'read', resource: 'TaxSettings', scope: 'ANY' as const },
  { action: 'write', resource: 'TaxSettings', scope: 'ANY' as const },
];

/**
 * P27-T02 acceptance over the wired stack: guard, feature gate, Zod pipe,
 * envelope and exception filter, with the repositories replaced. The
 * entitlement is read through `FeatureAvailabilityCacheService`, overridden
 * rather than widening the Prisma stub.
 */
describe('Tax settings integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const taxSettingsRepositoryMock = { findTaxSettings: jest.fn(), saveTaxSettings: jest.fn() };
  const clinicProfileRepositoryMock = {
    findProfile: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  const taxCodeRepositoryMock = {
    listTaxCodes: jest.fn(),
    findTaxCodeById: jest.fn(),
    createTaxCode: jest.fn(),
    updateTaxCode: jest.fn(),
    createTaxCodeRate: jest.fn(),
    listTaxCodeUsage: jest.fn(),
    listCategoryDefaults: jest.fn(),
    saveCategoryDefaults: jest.fn(),
  };
  const taxAssignmentRepositoryMock = {
    listActiveAssignmentTargets: jest.fn(),
    findExistingTargetIds: jest.fn(),
    assignTaxCode: jest.fn(),
  };
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

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
        {
          role: { code: roleCode, permissions: permissions.map((permission) => ({ permission })) },
        },
      ],
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(TaxSettingsRepository)
      .useValue(taxSettingsRepositoryMock)
      .overrideProvider(TaxCodeRepository)
      .useValue(taxCodeRepositoryMock)
      .overrideProvider(TaxAssignmentRepository)
      .useValue(taxAssignmentRepositoryMock)
      .overrideProvider(ClinicProfileRepository)
      .useValue(clinicProfileRepositoryMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(true);
    taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue(null);
    taxSettingsRepositoryMock.saveTaxSettings.mockImplementation((payload) =>
      Promise.resolve({ ...payload, updatedAt: new Date('2026-09-19T03:00:00.000Z') }),
    );
    clinicProfileRepositoryMock.findProfile.mockResolvedValue({ taxId: '0012345678901000' });
  });

  it('reads the defaults for a clinic that never saved a tax profile', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', TAX_SETTINGS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .get(TAX_SETTINGS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      incomeTaxRegime: 'GENERAL',
      isPkp: false,
      npwp: '0012345678901000',
      npwpStatus: 'VALID',
    });
  });

  it('refuses a PT on PP 55 without a start year with TAX_PP55_NOT_ELIGIBLE', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', TAX_SETTINGS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .patch(TAX_SETTINGS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ taxpayerType: 'PT', incomeTaxRegime: 'PP55_FINAL' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TAX_PP55_NOT_ELIGIBLE');
  });

  it('saves a profile and writes one TAX_SETTINGS_UPDATED audit row', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', TAX_SETTINGS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .patch(TAX_SETTINGS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({
        taxpayerType: 'INDIVIDUAL',
        incomeTaxRegime: 'PP55_FINAL',
        nitku: '0012.3456.7890.1000-000000',
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      taxpayerType: 'INDIVIDUAL',
      incomeTaxRegime: 'PP55_FINAL',
      nitku: '0012345678901000000000',
    });
    const taxAuditCalls = auditServiceMock.record.mock.calls.filter(
      ([event]) => event.action === 'TAX_SETTINGS_UPDATED',
    );
    expect(taxAuditCalls).toHaveLength(1);
  });

  it('refuses a malformed NITKU at the pipe', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', TAX_SETTINGS_PERMISSIONS);

    const response = await request(app.getHttpServer())
      .patch(TAX_SETTINGS_PATH)
      .set('Authorization', `Bearer ${token}`)
      .send({ nitku: '12345' });

    expect(response.status).toBe(400);
    expect(taxSettingsRepositoryMock.saveTaxSettings).not.toHaveBeenCalled();
  });

  it('refuses a caller without the tax-settings permission', async () => {
    const token = await buildToken('doctor-user', 'doctor@hms.local');
    mockActorWithPermissions('DOCTOR', [
      { action: 'read', resource: 'ClinicProfile', scope: 'ANY' },
    ]);

    const response = await request(app.getHttpServer())
      .get(TAX_SETTINGS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('refuses every route while the taxes feature is off', async () => {
    const token = await buildToken('admin-user', 'admin@hms.local');
    mockActorWithPermissions('ADMIN', TAX_SETTINGS_PERMISSIONS);
    featureAvailabilityCacheMock.isEnabled.mockResolvedValue(false);

    const response = await request(app.getHttpServer())
      .get(TAX_SETTINGS_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  describe('tax codes (P27-T03)', () => {
    const barangCode = {
      id: '5f3c2b1a-0d9e-4c8b-a7f6-e5d4c3b2a190',
      code: 'BARANG-PPN',
      name: 'Barang kena pajak',
      ppnTreatment: 'STANDARD',
      fakturTransactionCode: '04',
      invoiceNote: null,
      isSystem: true,
      isActive: true,
      rates: [
        {
          id: 'r1',
          ratePercent: 12,
          dppNumerator: 11,
          dppDenominator: 12,
          effectiveFrom: '2025-01-01',
        },
      ],
    };

    beforeEach(() => {
      taxCodeRepositoryMock.listTaxCodes.mockResolvedValue([barangCode]);
      taxCodeRepositoryMock.listTaxCodeUsage.mockResolvedValue([]);
      taxCodeRepositoryMock.listCategoryDefaults.mockResolvedValue([
        { target: 'MEDICATION', taxCodeId: barangCode.id },
      ]);
    });

    it('lists codes with the effective rate', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);

      const response = await request(app.getHttpServer())
        .get(TAX_CODES_PATH)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].rates[0].effectiveRatePercent).toBe(11);
    });

    it('refuses a code whose faktur code does not match its treatment at the pipe', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);

      const response = await request(app.getHttpServer())
        .post(TAX_CODES_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: 'ESTETIKA',
          name: 'Estetika',
          ppnTreatment: 'STANDARD',
          fakturTransactionCode: '08',
        });

      expect(response.status).toBe(400);
      expect(taxCodeRepositoryMock.createTaxCode).not.toHaveBeenCalled();
    });

    it('resolves a medication through its category default on the assignment list', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);
      taxAssignmentRepositoryMock.listActiveAssignmentTargets.mockResolvedValue([
        {
          kind: 'MEDICATION',
          id: 'med-1',
          code: 'AMOX500',
          name: 'Amoxicillin 500 mg',
          category: 'OBAT_KERAS',
          price: 1500,
          taxCodeId: null,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get(TAX_ASSIGNMENTS_PATH)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        source: 'CATEGORY_DEFAULT',
        effectiveTaxCode: { code: 'BARANG-PPN' },
      });
      expect(response.body.meta.unresolvedCount).toBe(0);
    });

    it('answers 404 TAX_ASSIGNMENT_TARGET_NOT_FOUND for a stale selection', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);
      taxAssignmentRepositoryMock.findExistingTargetIds.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .post(`${TAX_ASSIGNMENTS_PATH}/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          targets: [{ kind: 'SERVICE_TARIFF', id: '9d7a6f5e-4b3c-4a2f-9e0d-c9b8a7f6e5d4' }],
          taxCodeId: null,
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('TAX_ASSIGNMENT_TARGET_NOT_FOUND');
      expect(taxAssignmentRepositoryMock.assignTaxCode).not.toHaveBeenCalled();
    });

    it('answers 200 to a bulk apply, as the contract says', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);
      const targetId = '9d7a6f5e-4b3c-4a2f-9e0d-c9b8a7f6e5d4';
      taxAssignmentRepositoryMock.findExistingTargetIds.mockResolvedValue([targetId]);
      taxAssignmentRepositoryMock.assignTaxCode.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .post(`${TAX_ASSIGNMENTS_PATH}/bulk`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targets: [{ kind: 'SERVICE_TARIFF', id: targetId }], taxCodeId: null });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ updatedCount: 1 });
    });

    it('refuses the tax code routes to a caller holding only the tax-settings keys', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_SETTINGS_PERMISSIONS);

      const response = await request(app.getHttpServer())
        .get(TAX_CODES_PATH)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});
