import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import {
  InvoiceDocumentRecord,
  InvoiceRenderContextRecord,
  resolveDefaultTemplateSettings,
} from '@hms/shared-types';

import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { DocumentTemplateService } from '../../document-template/service/document-template.service';
import { ClinicProfileRepository } from '../repository/clinic-profile.repository';
import { InvoiceDocumentRepository } from '../repository/invoice-document.repository';
import { InvoiceDocumentMapper } from './invoice-document.mapper';
import { InvoiceDocumentService } from './invoice-document.service';

describe('InvoiceDocumentService', () => {
  const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake body');

  const repositoryMock = {
    findRenderContext: jest.fn(),
    findLatestDocument: jest.fn(),
    findDocumentForSlot: jest.fn(),
    createDocument: jest.fn(),
    completeRender: jest.fn(),
    failRender: jest.fn(),
    findDocumentById: jest.fn(),
  };
  const clinicProfileRepositoryMock = { findProfile: jest.fn() };
  const documentTemplateServiceMock = {
    findDefaultPublishedVersion: jest.fn(),
    findVersionById: jest.fn(),
  };
  const pdfRendererMock = { render: jest.fn() };
  const objectStorageMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getSignedUrl: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const configServiceMock = {
    get: jest.fn((key: string) => (key === 'CLINIC_TIMEZONE' ? 'Asia/Jakarta' : undefined)),
  };

  const service = new InvoiceDocumentService(
    repositoryMock as unknown as InvoiceDocumentRepository,
    clinicProfileRepositoryMock as unknown as ClinicProfileRepository,
    documentTemplateServiceMock as unknown as DocumentTemplateService,
    pdfRendererMock as unknown as PdfRendererService,
    objectStorageMock as unknown as ObjectStorageService,
    new InvoiceDocumentMapper(),
    configServiceMock as unknown as ConfigService,
  );

  function buildContext(
    overrides: Partial<InvoiceRenderContextRecord['invoice']> = {},
  ): InvoiceRenderContextRecord {
    return {
      invoice: {
        id: 'invoice-1',
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
        createdById: 'admin-1',
        createdAt: new Date('2026-09-01T02:00:00Z'),
        updatedAt: new Date('2026-09-01T03:00:00Z'),
        ...overrides,
      },
      items: [
        {
          id: 'item-1',
          invoiceId: 'invoice-1',
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

  function buildDocumentRecord(
    overrides: Partial<InvoiceDocumentRecord> = {},
  ): InvoiceDocumentRecord {
    return {
      id: 'document-1',
      invoiceId: 'invoice-1',
      templateVersionId: 'version-1',
      hasVoidWatermark: false,
      wasBoundRetroactively: false,
      renderedData: {
        values: { 'invoice.number': 'INV/20260901/0007', 'patient.fullName': 'Siti Rahmawati' },
        items: [],
        warnings: [],
      },
      status: 'PENDING',
      storageKey: null,
      checksum: null,
      sizeBytes: null,
      pageCount: null,
      renderWarnings: [],
      renderError: null,
      renderedAt: null,
      createdAt: new Date('2026-09-01T03:00:00Z'),
      updatedAt: new Date('2026-09-01T03:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    clinicProfileRepositoryMock.findProfile.mockResolvedValue(null);
    documentTemplateServiceMock.findDefaultPublishedVersion.mockResolvedValue(null);
    documentTemplateServiceMock.findVersionById.mockResolvedValue(null);
    pdfRendererMock.render.mockResolvedValue(pdfBytes);
    objectStorageMock.generateObjectKey.mockReturnValue('invoices/documents/generated-key.pdf');
    objectStorageMock.uploadObject.mockResolvedValue({ key: 'invoices/documents/generated-key.pdf' });
    objectStorageMock.deleteObject.mockResolvedValue({ key: 'x', deleted: true });
    repositoryMock.completeRender.mockResolvedValue(true);
  });

  it('refuses to render a DRAFT invoice', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(buildContext({ status: 'DRAFT' }));

    await expect(service.requestRender('invoice-1')).rejects.toBeInstanceOf(ConflictException);
    expect(pdfRendererMock.render).not.toHaveBeenCalled();
  });

  it('returns a READY document without touching the renderer', async () => {
    // The stored bytes ARE the document: serving them unchanged is what makes
    // two downloads byte-identical, so a repeat request must not re-render.
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(
      buildDocumentRecord({ status: 'READY', storageKey: 'k', checksum: 'abc' }),
    );

    const actual = await service.requestRender('invoice-1');

    expect(actual.status).toBe('READY');
    expect(actual.checksum).toBe('abc');
    expect(pdfRendererMock.render).not.toHaveBeenCalled();
    expect(repositoryMock.createDocument).not.toHaveBeenCalled();
  });

  it('cuts a retroactive snapshot and renders when no document exists', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(null);
    repositoryMock.createDocument.mockImplementation((payload) =>
      Promise.resolve(
        buildDocumentRecord({
          templateVersionId: payload.templateVersionId,
          wasBoundRetroactively: payload.wasBoundRetroactively,
          renderedData: payload.renderedData,
          renderWarnings: payload.renderWarnings,
        }),
      ),
    );
    const expectedChecksum = createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');
    repositoryMock.findDocumentById.mockResolvedValue(
      buildDocumentRecord({ status: 'READY', storageKey: 'k', checksum: expectedChecksum }),
    );

    const actual = await service.requestRender('invoice-1');

    const createPayload = repositoryMock.createDocument.mock.calls[0][0];
    expect(createPayload.wasBoundRetroactively).toBe(true);
    expect(createPayload.templateVersionId).toBeNull();
    // No published template: the warning names the fallback.
    expect(createPayload.renderWarnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ token: 'template' })]),
    );
    // The no-decrypt path: twelve mask characters and the stored last four.
    expect(createPayload.renderedData.values['patient.nikMasked']).toBe('••••••••••••3271');
    expect(objectStorageMock.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf' }),
    );
    expect(repositoryMock.completeRender).toHaveBeenCalledWith(
      expect.objectContaining({ checksum: expectedChecksum, sizeBytes: pdfBytes.byteLength }),
    );
    expect(actual.status).toBe('READY');
  });

  it('re-renders a snapshot against its pinned version, not the current default', async () => {
    // FR-E1-09: the template was edited and republished after issue; the row
    // still renders the version it snapshotted.
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(buildDocumentRecord({ status: 'FAILED' }));
    documentTemplateServiceMock.findVersionById.mockResolvedValue({
      id: 'version-1',
      templateId: 'template-1',
      versionNumber: 1,
      contentHtml: '<p>PINNED <span data-hms-var="invoice.number"></span></p>',
      settings: resolveDefaultTemplateSettings(),
      publishedById: null,
      publishedAt: new Date('2026-08-31T00:00:00Z'),
    });
    repositoryMock.findDocumentById.mockResolvedValue(
      buildDocumentRecord({ status: 'READY', storageKey: 'k', checksum: 'c' }),
    );

    await service.requestRender('invoice-1');

    expect(documentTemplateServiceMock.findVersionById).toHaveBeenCalledWith('version-1');
    expect(documentTemplateServiceMock.findDefaultPublishedVersion).not.toHaveBeenCalled();
    const renderedHtml = pdfRendererMock.render.mock.calls[0][0] as string;
    expect(renderedHtml).toContain('PINNED');
    expect(renderedHtml).toContain('INV/20260901/0007');
  });

  it('marks the row FAILED with the adapter reason when the sidecar is down, without throwing', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(buildDocumentRecord());
    pdfRendererMock.render.mockRejectedValue(
      new ServiceUnavailableException('PDF renderer is unreachable'),
    );
    repositoryMock.findDocumentById.mockResolvedValue(
      buildDocumentRecord({ status: 'FAILED', renderError: 'PDF renderer is unreachable' }),
    );

    const actual = await service.requestRender('invoice-1');

    expect(repositoryMock.failRender).toHaveBeenCalledWith(
      'document-1',
      'PDF renderer is unreachable',
    );
    expect(actual.status).toBe('FAILED');
    expect(actual.renderError).toBe('PDF renderer is unreachable');
    expect(objectStorageMock.uploadObject).not.toHaveBeenCalled();
  });

  it('renders a VOID invoice into the watermark slot with the watermark stamped', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(
      buildContext({ status: 'VOID', voidReason: 'wrong patient' }),
    );
    repositoryMock.findLatestDocument.mockResolvedValue(null);
    repositoryMock.createDocument.mockImplementation((payload) =>
      Promise.resolve(
        buildDocumentRecord({
          templateVersionId: null,
          hasVoidWatermark: payload.hasVoidWatermark,
          renderedData: payload.renderedData,
        }),
      ),
    );
    repositoryMock.findDocumentById.mockResolvedValue(
      buildDocumentRecord({ status: 'READY', hasVoidWatermark: true, storageKey: 'k', checksum: 'c' }),
    );

    await service.requestRender('invoice-1');

    expect(repositoryMock.findLatestDocument).toHaveBeenCalledWith('invoice-1', true);
    expect(repositoryMock.createDocument.mock.calls[0][0].hasVoidWatermark).toBe(true);
    // Watermark rows are the natural post-void document, not a retroactive
    // binding.
    expect(repositoryMock.createDocument.mock.calls[0][0].wasBoundRetroactively).toBe(false);
    const renderedHtml = pdfRendererMock.render.mock.calls[0][0] as string;
    expect(renderedHtml).toContain('BATAL / VOID');
    expect(renderedHtml).toContain('wrong patient');
  });

  it('adopts the concurrent winner\'s row instead of failing on the unique index', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(null);
    repositoryMock.createDocument.mockRejectedValue({ code: 'P2002' });
    const winnerRow = buildDocumentRecord({
      status: 'READY',
      templateVersionId: null,
      storageKey: 'k',
      checksum: 'winner',
    });
    repositoryMock.findDocumentForSlot.mockResolvedValue(winnerRow);

    const actual = await service.requestRender('invoice-1');

    expect(actual.checksum).toBe('winner');
    expect(pdfRendererMock.render).not.toHaveBeenCalled();
  });

  it('never lets a snapshot failure escape issueInvoice', async () => {
    repositoryMock.findRenderContext.mockRejectedValue(new Error('database down'));

    await expect(service.snapshotOnIssue('invoice-1')).resolves.toBeUndefined();
  });

  it('mints an attachment download with the compact invoice-number filename', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(
      buildDocumentRecord({ status: 'READY', storageKey: 'invoices/documents/k.pdf', checksum: 'c' }),
    );
    objectStorageMock.getSignedUrl.mockResolvedValue({
      url: 'https://signed.example/k.pdf',
      expiresAt: '2026-09-01T07:15:00.000Z',
    });

    const actual = await service.createDownloadUrl('invoice-1');

    expect(actual.fileName).toBe('INV-20260901-0007.pdf');
    expect(objectStorageMock.getSignedUrl).toHaveBeenCalledWith({
      key: 'invoices/documents/k.pdf',
      responseContentDisposition: 'attachment; filename="INV-20260901-0007.pdf"',
      responseContentType: 'application/pdf',
    });
  });

  it('refuses a download while the document is not READY', async () => {
    repositoryMock.findRenderContext.mockResolvedValue(buildContext());
    repositoryMock.findLatestDocument.mockResolvedValue(buildDocumentRecord({ status: 'FAILED' }));

    await expect(service.createDownloadUrl('invoice-1')).rejects.toBeInstanceOf(ConflictException);
    expect(objectStorageMock.getSignedUrl).not.toHaveBeenCalled();
  });
});
