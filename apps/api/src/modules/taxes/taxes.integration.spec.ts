import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AuditService } from '../../common/audit/audit.service';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { ClinicProfileRepository } from '../billing/repository/clinic-profile.repository';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { TaxAssignmentRepository } from '../tax-core/repository/tax-assignment.repository';
import { TaxCodeRepository } from '../tax-core/repository/tax-code.repository';
import { TaxSettingsRepository } from '../tax-core/repository/tax-settings.repository';
import { TaxReportRepository } from './repository/tax-report.repository';
import { TaxReportDocumentRepository } from './repository/tax-report-document.repository';

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
    findAssignmentTargets: jest.fn(),
    findTaxCodeOverrides: jest.fn(),
    listActiveAssignmentTargets: jest.fn(),
    findExistingTargetIds: jest.fn(),
    assignTaxCode: jest.fn(),
  };
  const taxReportRepositoryMock = {
    findPaymentsPaidBetween: jest.fn(),
    sumPaymentsPaidBetween: jest.fn(),
    findIssuedInvoiceLinesBetween: jest.fn(),
    listReportsForYear: jest.fn(),
    findReportById: jest.fn(),
    findReportByPeriodAndKind: jest.fn(),
    createReport: jest.fn(),
    updateReportComputation: jest.fn(),
    finalizeReport: jest.fn(),
    findReportActorNames: jest.fn(),
  };
  const taxReportDocumentRepositoryMock = {
    findDocumentByReportId: jest.fn(),
    saveReadyDocument: jest.fn(),
    saveFailedDocument: jest.fn(),
  };
  const pdfRendererMock = { render: jest.fn() };
  const objectStorageMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getObject: jest.fn(),
    getSignedUrl: jest.fn(),
    deleteObject: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    headObject: jest.fn(),
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
      .overrideProvider(TaxReportRepository)
      .useValue(taxReportRepositoryMock)
      .overrideProvider(TaxReportDocumentRepository)
      .useValue(taxReportDocumentRepositoryMock)
      .overrideProvider(PdfRendererService)
      .useValue(pdfRendererMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageMock)
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

    it('breaks a medicine price into before-PPN and PPN for a PKP clinic (P27-T04)', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);
      taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue({
        taxpayerType: 'PT',
        incomeTaxRegime: 'GENERAL',
        pp55StartYear: null,
        isPkp: true,
        pkpSince: '2025-01-02',
        nitku: null,
        updatedById: null,
        updatedAt: null,
      });
      const medicineId = '8c6f5e4d-3a2b-4f1e-8d9c-b8a7f6e5d4c3';
      taxAssignmentRepositoryMock.findAssignmentTargets.mockResolvedValue([
        {
          kind: 'MEDICATION',
          id: medicineId,
          code: 'AMOX',
          name: 'Amoxicillin',
          category: 'OBAT_KERAS',
          price: 111000,
          taxCodeId: null,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/tax/price-breakdowns')
        .query({ kind: 'MEDICATION', ids: medicineId })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({
          status: 'TAXED',
          price: 111000,
          priceBeforeTax: 100000,
          taxAmount: 11000,
        }),
      ]);
    });

    it('refuses a breakdown request whose ids are not uuids', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);

      const response = await request(app.getHttpServer())
        .get('/api/v1/v1/tax/price-breakdowns')
        .query({ kind: 'MEDICATION', ids: 'not-a-uuid' })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
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

  describe('monthly tax report drafts (P27-T05)', () => {
    const REPORTS_PATH = '/api/v1/v1/tax/reports';
    const REPORT_PERMISSIONS = [
      { action: 'read', resource: 'TaxReport', scope: 'ANY' as const },
      { action: 'write', resource: 'TaxReport', scope: 'ANY' as const },
    ];
    const pp55Settings = {
      taxpayerType: 'INDIVIDUAL',
      incomeTaxRegime: 'PP55_FINAL',
      pp55StartYear: 2025,
      isPkp: false,
      pkpSince: null,
      nitku: null,
      updatedById: null,
      updatedAt: null,
    };

    beforeEach(() => {
      taxSettingsRepositoryMock.findTaxSettings.mockResolvedValue(pp55Settings);
      taxReportRepositoryMock.findPaymentsPaidBetween.mockResolvedValue([
        {
          paymentId: 'pay-1',
          invoiceNumber: 'INV/20260210/0001',
          paidAt: new Date('2026-02-10T03:00:00.000Z'),
          method: 'CASH',
          amount: 400000000,
        },
      ]);
      taxReportRepositoryMock.sumPaymentsPaidBetween.mockResolvedValue(300000000);
      taxReportRepositoryMock.findReportByPeriodAndKind.mockResolvedValue(null);
      taxReportRepositoryMock.createReport.mockImplementation(async (payload) => ({
        id: '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b',
        period: payload.period,
        kind: payload.kind,
        status: 'DRAFT',
        summary: payload.summary,
        lines: payload.lines,
        generatedAt: new Date('2026-03-02T00:00:00.000Z'),
        generatedById: 'actor-user',
        finalizedAt: null,
        finalizedById: null,
      }));
    });

    it('drafts a PP 55 month and exports it as CSV whose totals match', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', REPORT_PERMISSIONS);

      const created = await request(app.getHttpServer())
        .post(REPORTS_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send({ period: '2026-02', kind: 'PP55_OMZET' });
      taxReportRepositoryMock.findReportById.mockResolvedValue(
        await taxReportRepositoryMock.createReport.mock.results[0]?.value,
      );
      const exported = await request(app.getHttpServer())
        .get(`${REPORTS_PATH}/${created.body.data.id}/export`)
        .set('Authorization', `Bearer ${token}`);

      expect(created.status).toBe(201);
      expect(created.body.data.summary.totals).toEqual({
        grossOmzet: 400000000,
        taxableOmzet: 200000000,
        taxDue: 1000000,
      });
      expect(exported.status).toBe(200);
      expect(exported.headers['content-type']).toContain('text/csv');
      expect(exported.text).toContain('PPh final terutang,1000000');
    });

    it('refuses a PPN draft for a clinic that is not PKP', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', REPORT_PERMISSIONS);

      const response = await request(app.getHttpServer())
        .post(REPORTS_PATH)
        .set('Authorization', `Bearer ${token}`)
        .send({ period: '2026-02', kind: 'PPN_OUTPUT' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('TAX_REPORT_NOT_APPLICABLE');
    });

    it('lists the year with the kinds the tax profile calls for', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', REPORT_PERMISSIONS);
      taxReportRepositoryMock.listReportsForYear.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(REPORTS_PATH)
        .query({ year: 2026 })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ year: 2026, applicableKinds: ['PP55_OMZET'] });
    });

    it('refuses the report routes without the tax-report permission', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', TAX_CODE_PERMISSIONS);

      const response = await request(app.getHttpServer())
        .get(REPORTS_PATH)
        .query({ year: 2026 })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
  describe('monthly tax report PDF (P27-T12)', () => {
    const REPORTS_PATH = '/api/v1/v1/tax/reports';
    const REPORT_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
    const READ_PERMISSION = [{ action: 'read', resource: 'TaxReport', scope: 'ANY' as const }];
    const storedObjects = new Map<string, Buffer>();
    let storedDocument: Record<string, unknown> | null = null;

    function buildReport(status: 'DRAFT' | 'FINALIZED'): Record<string, unknown> {
      return {
        id: REPORT_ID,
        period: '2026-02',
        kind: 'PP55_OMZET',
        status,
        summary: {
          kind: 'PP55_OMZET',
          taxpayerType: 'INDIVIDUAL',
          ratePercent: 0.5,
          paymentCount: 1,
          yearToDateOmzetBefore: 300000000,
          nonTaxableAllowanceUsed: 200000000,
          totals: { grossOmzet: 400000000, taxableOmzet: 200000000, taxDue: 1000000 },
          taxAccountCode: '411128',
          depositTypeCode: '420',
          paymentDueDate: '2026-03-15',
          reportingDueDate: '2026-03-15',
        },
        lines: [],
        generatedAt: new Date('2026-03-02T00:00:00.000Z'),
        generatedById: 'actor-user',
        finalizedAt: status === 'FINALIZED' ? new Date('2026-03-02T00:00:00.000Z') : null,
        finalizedById: status === 'FINALIZED' ? 'actor-user' : null,
      };
    }

    function requestPdf(token: string): request.Test {
      return request(app.getHttpServer())
        .post(`${REPORTS_PATH}/${REPORT_ID}/pdf`)
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
    }

    beforeEach(() => {
      storedObjects.clear();
      storedDocument = null;
      let renderCount = 0;
      pdfRendererMock.render.mockImplementation(async () => {
        renderCount += 1;
        return new Uint8Array(Buffer.from(`%PDF-1.7 render ${renderCount}`));
      });
      objectStorageMock.generateObjectKey.mockReturnValue('tax-report/document/stored.pdf');
      objectStorageMock.uploadObject.mockImplementation(async ({ key, body }) => {
        storedObjects.set(key, body);
        return { key };
      });
      objectStorageMock.getObject.mockImplementation(async ({ key }) => ({
        body: storedObjects.get(key),
        contentType: 'application/pdf',
      }));
      objectStorageMock.getSignedUrl.mockResolvedValue({
        url: 'https://storage.example/signed',
        expiresAt: '2026-03-02T01:00:00.000Z',
      });
      taxReportDocumentRepositoryMock.findDocumentByReportId.mockImplementation(
        async () => storedDocument,
      );
      taxReportDocumentRepositoryMock.saveReadyDocument.mockImplementation(async (payload) => {
        storedDocument = { id: 'doc-1', status: 'READY', failureReason: null, ...payload };
        return true;
      });
      taxReportRepositoryMock.findReportActorNames.mockResolvedValue({
        generatedByName: 'admin@hms.local',
        finalizedByName: 'admin@hms.local',
      });
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(null);
    });

    it('streams a DRAFT with its watermark and the summary totals, unstored, audited once', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', READ_PERMISSION);
      taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport('DRAFT'));

      const response = await requestPdf(token);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain(
        'pajak-pp55-omzet-2026-02-draft.pdf',
      );
      expect((response.body as Buffer).toString()).toBe('%PDF-1.7 render 1');
      const html = pdfRendererMock.render.mock.calls[0][0] as string;
      expect(html).toContain('class="watermark"');
      expect(html).toContain('Rp 1.000.000');
      expect(objectStorageMock.uploadObject).not.toHaveBeenCalled();
      expect(auditServiceMock.record).toHaveBeenCalledTimes(1);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXPORT', resource: 'tax-report' }),
      );
    });

    it('renders a finalized report once and serves the same bytes after the books change', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', READ_PERMISSION);
      taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport('FINALIZED'));

      const first = await requestPdf(token);
      // The books change after finalizing (an invoice voided): the stored file does not.
      taxReportRepositoryMock.findPaymentsPaidBetween.mockResolvedValue([]);
      const second = await requestPdf(token);
      const link = await request(app.getHttpServer())
        .get(`${REPORTS_PATH}/${REPORT_ID}/pdf/download-url`)
        .set('Authorization', `Bearer ${token}`);

      expect([first.status, second.status, link.status]).toEqual([200, 200, 200]);
      expect((second.body as Buffer).equals(first.body as Buffer)).toBe(true);
      expect(pdfRendererMock.render).toHaveBeenCalledTimes(1);
      expect(link.body.data).toEqual({
        url: 'https://storage.example/signed',
        fileName: 'pajak-pp55-omzet-2026-02.pdf',
        expiresAt: '2026-03-02T01:00:00.000Z',
      });
      expect(auditServiceMock.record).toHaveBeenCalledTimes(3);
    });

    it('refuses a link for a DRAFT', async () => {
      const token = await buildToken('admin-user', 'admin@hms.local');
      mockActorWithPermissions('ADMIN', READ_PERMISSION);
      taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport('DRAFT'));

      const response = await request(app.getHttpServer())
        .get(`${REPORTS_PATH}/${REPORT_ID}/pdf/download-url`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('TAX_REPORT_NOT_FINALIZED');
    });

    it('refuses both PDF routes without tax-report.read:any and audits nothing', async () => {
      const token = await buildToken('doctor-user', 'doctor@hms.local');
      mockActorWithPermissions('DOCTOR', []);
      taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport('FINALIZED'));

      const pdf = await requestPdf(token);
      const link = await request(app.getHttpServer())
        .get(`${REPORTS_PATH}/${REPORT_ID}/pdf/download-url`)
        .set('Authorization', `Bearer ${token}`);

      expect([pdf.status, link.status]).toEqual([403, 403]);
      expect(pdfRendererMock.render).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });
  });
});
