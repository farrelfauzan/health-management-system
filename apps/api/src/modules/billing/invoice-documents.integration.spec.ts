import { INestApplication, ServiceUnavailableException, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CompleteInvoiceDocumentRenderPayload,
  CreateInvoiceDocumentRecordPayload,
  InvoiceDocumentRecord,
  InvoiceRenderContextRecord,
} from '@hms/shared-types';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { FeatureAvailabilityCacheService } from '../feature-entitlement/service/feature-availability-cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../common/storage/object-storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { DocumentTemplateRepository } from '../document-template/repository/document-template.repository';
import { ClinicProfileRepository } from './repository/clinic-profile.repository';
import { InvoiceDocumentRepository } from './repository/invoice-document.repository';

const INVOICE_ID = '3f9d18e2-6b1a-4a53-a51e-70c9b9c7d8a1';
const DOCUMENT_PATH = `/api/v1/v1/invoices/${INVOICE_ID}/document`;

/**
 * `P16-T06` over the wired stack: guard, envelope, and the render round trip
 * with persistence, storage, and the sidecar replaced by fakes. The database
 * race behaviour (partial unique slots) is proven by the migration's indexes
 * plus the service unit spec's P2002 branch.
 */
class InMemoryInvoiceDocumentRepository {
  contextsByInvoiceId = new Map<string, InvoiceRenderContextRecord>();
  private rows = new Map<string, InvoiceDocumentRecord>();
  private nextRowNumber = 1;

  reset(): void {
    this.contextsByInvoiceId.clear();
    this.rows.clear();
    this.nextRowNumber = 1;
  }

  async findRenderContext(invoiceId: string): Promise<InvoiceRenderContextRecord | null> {
    return this.contextsByInvoiceId.get(invoiceId) ?? null;
  }

  async findLatestDocument(
    invoiceId: string,
    hasVoidWatermark: boolean,
  ): Promise<InvoiceDocumentRecord | null> {
    const matches = [...this.rows.values()]
      .filter((row) => row.invoiceId === invoiceId && row.hasVoidWatermark === hasVoidWatermark)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
    return matches[0] ?? null;
  }

  async findDocumentForSlot(
    invoiceId: string,
    templateVersionId: string | null,
    hasVoidWatermark: boolean,
  ): Promise<InvoiceDocumentRecord | null> {
    return (
      [...this.rows.values()].find(
        (row) =>
          row.invoiceId === invoiceId &&
          row.templateVersionId === templateVersionId &&
          row.hasVoidWatermark === hasVoidWatermark,
      ) ?? null
    );
  }

  async createDocument(
    payload: CreateInvoiceDocumentRecordPayload,
  ): Promise<InvoiceDocumentRecord> {
    const id = `document-${this.nextRowNumber++}`;
    const record: InvoiceDocumentRecord = {
      id,
      invoiceId: payload.invoiceId,
      templateVersionId: payload.templateVersionId,
      hasVoidWatermark: payload.hasVoidWatermark,
      wasBoundRetroactively: payload.wasBoundRetroactively,
      renderedData: payload.renderedData,
      status: 'PENDING',
      storageKey: null,
      checksum: null,
      sizeBytes: null,
      pageCount: null,
      renderWarnings: payload.renderWarnings,
      renderError: null,
      renderedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(id, record);
    return record;
  }

  async completeRender(payload: CompleteInvoiceDocumentRenderPayload): Promise<boolean> {
    const row = this.rows.get(payload.id);
    if (row === undefined || row.status === 'READY') {
      return false;
    }
    this.rows.set(payload.id, {
      ...row,
      status: 'READY',
      storageKey: payload.storageKey,
      checksum: payload.checksum,
      sizeBytes: payload.sizeBytes,
      pageCount: payload.pageCount,
      renderedAt: payload.renderedAt,
      renderError: null,
      updatedAt: new Date(),
    });
    return true;
  }

  async failRender(id: string, renderError: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (row === undefined || row.status === 'READY') {
      return false;
    }
    this.rows.set(id, { ...row, status: 'FAILED', renderError, updatedAt: new Date() });
    return true;
  }

  async findDocumentById(id: string): Promise<InvoiceDocumentRecord | null> {
    return this.rows.get(id) ?? null;
  }
}

function buildPaidContext(): InvoiceRenderContextRecord {
  return {
    invoice: {
      id: INVOICE_ID,
      invoiceNumber: 'INV/20260901/0007',
      encounterId: 'encounter-1',
      admissionId: null,
      patientId: 'patient-1',
      status: 'PAID',
      totalAmount: 275_000,
      issuedAt: new Date('2026-09-01T03:00:00Z'),
      voidedAt: null,
      voidReason: null,
      voidedById: null,
      createdById: null,
      createdAt: new Date('2026-09-01T02:00:00Z'),
      updatedAt: new Date('2026-09-01T03:00:00Z'),
    },
    items: [
      {
        id: 'item-1',
        invoiceId: INVOICE_ID,
        itemType: 'CONSULTATION',
        serviceTariffId: null,
        medicationId: null,
        description: 'Konsultasi Dokter Umum',
        quantity: 1,
        unitPrice: 275_000,
        amount: 275_000,
        createdAt: new Date('2026-09-01T02:00:00Z'),
        updatedAt: new Date('2026-09-01T02:00:00Z'),
      },
    ],
    patient: {
      fullName: 'Siti Rahmawati',
      mrn: 'RM-000142',
      dateOfBirth: new Date('1988-02-04T00:00:00Z'),
      sex: 'FEMALE',
      address: 'Jl. Kenanga No. 3',
      phoneNumber: '0812000000',
      nikLast4: '3271',
    },
    encounter: {
      startedAt: new Date('2026-09-01T02:30:00Z'),
      doctorName: 'dr. Andi Prasetyo, Sp.PD',
      specialtyName: 'Penyakit Dalam',
    },
    admission: null,
    payment: {
      method: 'QRIS',
      paidAt: new Date('2026-09-01T03:10:00Z'),
      referenceNumber: 'QR-88213771',
      cashierName: 'kasir@hms.local',
    },
    voidedByName: null,
  };
}

describe('Invoice documents integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const fakeRepository = new InMemoryInvoiceDocumentRepository();
  const authRepositoryMock = { findUserById: jest.fn(), findUserByEmail: jest.fn() };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };
  /**
   * `P16-T21` put this controller behind an entitlement, and `FeatureGuard`
   * resolves it through Prisma on every request — which this suite replaces
   * wholesale. Overriding the cache rather than adding a Prisma delegate
   * keeps the "nothing was persisted" assertions below meaningful: the
   * entitlement read is not a persistence call this feature makes.
   *
   * Always enabled, which is the seeded default.
   */
  const featureAvailabilityCacheMock = {
    isEnabled: jest.fn<Promise<boolean>, [string]>(async () => true),
  };
  const pdfRendererMock = { render: jest.fn() };
  const objectStorageMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getObject: jest.fn(),
    getSignedUrl: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const clinicProfileRepositoryMock = {
    findProfile: jest.fn().mockResolvedValue(null),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  const documentTemplateRepositoryMock = {
    listByKind: jest.fn(),
    findById: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    publishTemplate: jest.fn(),
    setDefaultTemplate: jest.fn(),
    archiveTemplate: jest.fn(),
    findVersionById: jest.fn().mockResolvedValue(null),
    findLatestPublishedVersionByKind: jest.fn().mockResolvedValue(null),
  };

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

  function mockCashier(): void {
    mockActorWithPermissions('ADMIN', [
      { action: 'read', resource: 'Invoice', scope: 'ANY' },
      { action: 'write', resource: 'Invoice', scope: 'ANY' },
    ]);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(AuditService)
      .useValue(auditServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(FeatureAvailabilityCacheService)
      .useValue(featureAvailabilityCacheMock)
      .overrideProvider(InvoiceDocumentRepository)
      .useValue(fakeRepository)
      .overrideProvider(ClinicProfileRepository)
      .useValue(clinicProfileRepositoryMock)
      .overrideProvider(DocumentTemplateRepository)
      .useValue(documentTemplateRepositoryMock)
      .overrideProvider(PdfRendererService)
      .useValue(pdfRendererMock)
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorageMock)
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
    fakeRepository.reset();
    fakeRepository.contextsByInvoiceId.set(INVOICE_ID, buildPaidContext());
    documentTemplateRepositoryMock.findLatestPublishedVersionByKind.mockResolvedValue(null);
    documentTemplateRepositoryMock.findVersionById.mockResolvedValue(null);
    pdfRendererMock.render.mockResolvedValue(new TextEncoder().encode('%PDF-1.4 body'));
    objectStorageMock.generateObjectKey.mockReturnValue('invoices/documents/fixture.pdf');
    objectStorageMock.uploadObject.mockResolvedValue({ key: 'invoices/documents/fixture.pdf' });
    objectStorageMock.getSignedUrl.mockResolvedValue({
      url: 'https://signed.example/fixture.pdf',
      expiresAt: '2026-09-01T07:15:00.000Z',
    });
  });

  it('refuses an unauthenticated render request', async () => {
    const response = await request(app.getHttpServer()).post(DOCUMENT_PATH);

    expect(response.status).toBe(401);
  });

  it('refuses a render from an actor without the invoice write grant', async () => {
    const token = await buildToken('reader', 'reader@hms.local');
    mockActorWithPermissions('ADMIN', [{ action: 'read', resource: 'Invoice', scope: 'ANY' }]);

    const response = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('renders, stores, and reports a READY document with checksum and warnings', async () => {
    const token = await buildToken('cashier', 'kasir@hms.local');
    mockCashier();

    const rendered = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(rendered.status).toBe(200);
    expect(rendered.body.data.status).toBe('READY');
    expect(rendered.body.data.checksum).toHaveLength(64);
    expect(rendered.body.data.wasBoundRetroactively).toBe(true);
    expect(rendered.body.data.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ token: 'template' })]),
    );
    expect(pdfRendererMock.render).toHaveBeenCalledTimes(1);

    const metadata = await request(app.getHttpServer())
      .get(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(metadata.status).toBe(200);
    expect(metadata.body.data.checksum).toBe(rendered.body.data.checksum);
  });

  it('does not re-render on a second request — the stored document is the document', async () => {
    const token = await buildToken('cashier', 'kasir@hms.local');
    mockCashier();

    const first = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(second.body.data.checksum).toBe(first.body.data.checksum);
    expect(pdfRendererMock.render).toHaveBeenCalledTimes(1);
    expect(objectStorageMock.uploadObject).toHaveBeenCalledTimes(1);
  });

  it('serves the download as a pinned-type attachment named by the invoice number', async () => {
    const token = await buildToken('cashier', 'kasir@hms.local');
    mockCashier();
    await request(app.getHttpServer()).post(DOCUMENT_PATH).set('Authorization', `Bearer ${token}`);

    const download = await request(app.getHttpServer())
      .get(`${DOCUMENT_PATH}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(download.status).toBe(200);
    expect(download.body.data.fileName).toBe('INV-20260901-0007.pdf');
    expect(download.body.data.url).toBe('https://signed.example/fixture.pdf');
    expect(objectStorageMock.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        responseContentDisposition: 'attachment; filename="INV-20260901-0007.pdf"',
        responseContentType: 'application/pdf',
      }),
    );
  });

  it('refuses to render a DRAFT invoice with the issue-first message', async () => {
    const token = await buildToken('cashier', 'kasir@hms.local');
    mockCashier();
    const draftContext = buildPaidContext();
    fakeRepository.contextsByInvoiceId.set(INVOICE_ID, {
      ...draftContext,
      invoice: { ...draftContext.invoice, status: 'DRAFT' },
    });

    const response = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('Issue the invoice first');
  });

  it('reports FAILED with a retryable reason when the sidecar is down, then recovers', async () => {
    const token = await buildToken('cashier', 'kasir@hms.local');
    mockCashier();
    pdfRendererMock.render.mockRejectedValueOnce(
      new ServiceUnavailableException('PDF renderer is unreachable'),
    );

    const failed = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(failed.status).toBe(200);
    expect(failed.body.data.status).toBe('FAILED');
    expect(failed.body.data.renderError).toBe('PDF renderer is unreachable');

    const retried = await request(app.getHttpServer())
      .post(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(retried.body.data.status).toBe('READY');
  });

  it('answers 404 for metadata before any document exists', async () => {
    const token = await buildToken('cashier', 'kasir@hms.local');
    mockCashier();

    const response = await request(app.getHttpServer())
      .get(DOCUMENT_PATH)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});
