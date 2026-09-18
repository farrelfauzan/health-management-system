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
import { TaxSettingsRepository } from './repository/tax-settings.repository';

const TAX_SETTINGS_PATH = '/api/v1/v1/tax/settings';
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
      pricesIncludeTax: true,
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
});
