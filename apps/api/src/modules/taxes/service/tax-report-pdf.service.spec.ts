import { TaxReportDocumentRecord, TaxReportRecord } from '@hms/shared-types';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { TaxReportDocumentRepository } from '../repository/tax-report-document.repository';
import { TaxReportPdfService } from './tax-report-pdf.service';

const STORAGE_KEY = 'tax-report/document/5b7c9d1e.pdf';

describe('TaxReportPdfService (P27-T12)', () => {
  const taxReportRepositoryMock = {
    findReportById: jest.fn(),
    findReportActorNames: jest.fn(),
  };
  const documentRepositoryMock = {
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
  };
  const auditServiceMock = { record: jest.fn() };

  const service = new TaxReportPdfService(
    taxReportRepositoryMock as unknown as TaxReportRepository,
    documentRepositoryMock as unknown as TaxReportDocumentRepository,
    {
      getTaxSettings: jest.fn().mockResolvedValue({ nitku: null }),
    } as unknown as TaxProfileService,
    {
      getLetterhead: jest.fn().mockResolvedValue({
        name: 'Klinik Sehat',
        legalName: null,
        address: null,
        taxId: null,
        logoDataUri: null,
      }),
    } as unknown as ClinicProfileService,
    pdfRendererMock as unknown as PdfRendererService,
    objectStorageMock as unknown as ObjectStorageService,
    auditServiceMock as unknown as AuditService,
    { get: jest.fn().mockReturnValue('Asia/Jakarta') } as unknown as ConfigService,
  );

  const actor = { sub: 'a1b2c3d4-0000-4000-8000-000000000001' } as CurrentUser;

  function buildReport(overrides: Partial<TaxReportRecord> = {}): TaxReportRecord {
    return {
      id: 'report-sep',
      period: '2026-09',
      kind: 'PP55_OMZET',
      status: 'FINALIZED',
      summary: {
        kind: 'PP55_OMZET',
        taxpayerType: 'INDIVIDUAL',
        ratePercent: 0.5,
        paymentCount: 0,
        yearToDateOmzetBefore: 0,
        nonTaxableAllowanceUsed: 0,
        totals: { grossOmzet: 0, taxableOmzet: 0, taxDue: 0 },
        taxAccountCode: '411128',
        depositTypeCode: '420',
        paymentDueDate: '2026-10-15',
        reportingDueDate: '2026-10-15',
      },
      lines: [],
      generatedAt: new Date('2026-10-01T01:00:00.000Z'),
      generatedById: actor.sub,
      finalizedAt: new Date('2026-10-01T01:00:00.000Z'),
      finalizedById: actor.sub,
      ...overrides,
    };
  }

  function buildDocument(
    overrides: Partial<TaxReportDocumentRecord> = {},
  ): TaxReportDocumentRecord {
    return {
      id: 'doc-1',
      reportId: 'report-sep',
      status: 'READY',
      storageKey: STORAGE_KEY,
      checksum: 'abc',
      sizeBytes: 5,
      failureReason: null,
      renderedAt: new Date('2026-10-01T01:00:00.000Z'),
      ...overrides,
    };
  }

  /** A document store that behaves like the table: one row per report. */
  function useInMemoryDocumentStore(): void {
    let row: TaxReportDocumentRecord | null = null;
    documentRepositoryMock.findDocumentByReportId.mockImplementation(async () => row);
    documentRepositoryMock.saveReadyDocument.mockImplementation(async (payload) => {
      if (row?.status === 'READY') {
        return false;
      }
      row = buildDocument({ storageKey: payload.storageKey, checksum: payload.checksum });
      return true;
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    taxReportRepositoryMock.findReportActorNames.mockResolvedValue({
      generatedByName: 'admin@klinik.id',
      finalizedByName: 'admin@klinik.id',
    });
    objectStorageMock.generateObjectKey.mockReturnValue(STORAGE_KEY);
    pdfRendererMock.render.mockResolvedValue(new Uint8Array(Buffer.from('%PDF-1')));
  });

  it('renders a DRAFT on every request with its watermark and never stores it', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport({ status: 'DRAFT' }));

    const actual = await service.renderPdf('report-sep', actor);
    await service.renderPdf('report-sep', actor);

    expect(actual.fileName).toBe('pajak-pp55-omzet-2026-09-draft.pdf');
    expect(pdfRendererMock.render).toHaveBeenCalledTimes(2);
    expect(pdfRendererMock.render.mock.calls[0][0]).toContain('class="watermark"');
    expect(pdfRendererMock.render.mock.calls[0][1].footerHtml).toContain('pageNumber');
    expect(objectStorageMock.uploadObject).not.toHaveBeenCalled();
    expect(documentRepositoryMock.saveReadyDocument).not.toHaveBeenCalled();
  });

  it('renders a finalized report once: two downloads are the same bytes and one render', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport());
    useInMemoryDocumentStore();
    const storedBytes = Buffer.from('%PDF-1');
    objectStorageMock.getObject.mockResolvedValue({
      body: storedBytes,
      contentType: 'application/pdf',
    });

    const first = await service.renderPdf('report-sep', actor);
    const second = await service.renderPdf('report-sep', actor);

    expect(pdfRendererMock.render).toHaveBeenCalledTimes(1);
    expect(objectStorageMock.uploadObject).toHaveBeenCalledTimes(1);
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
    expect(first.fileName).toBe('pajak-pp55-omzet-2026-09.pdf');
  });

  it('retries a FAILED render, and records a failure as FAILED with a 503', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport());
    documentRepositoryMock.findDocumentByReportId.mockResolvedValue(
      buildDocument({ status: 'FAILED', storageKey: null }),
    );
    pdfRendererMock.render.mockRejectedValue(
      new ServiceUnavailableException('PDF renderer is unreachable'),
    );

    await expect(service.renderPdf('report-sep', actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(pdfRendererMock.render).toHaveBeenCalledTimes(1);
    expect(documentRepositoryMock.saveFailedDocument).toHaveBeenCalledWith({
      reportId: 'report-sep',
      failureReason: 'PDF renderer is unreachable',
    });
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('discards its own file when a concurrent render stored one first', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport());
    documentRepositoryMock.findDocumentByReportId
      .mockResolvedValueOnce(null)
      .mockResolvedValue(buildDocument({ storageKey: 'tax-report/document/winner.pdf' }));
    documentRepositoryMock.saveReadyDocument.mockResolvedValue(false);
    objectStorageMock.getObject.mockResolvedValue({ body: Buffer.from('%PDF-winner') });

    const actual = await service.renderPdf('report-sep', actor);

    expect(objectStorageMock.deleteObject).toHaveBeenCalledWith({ key: STORAGE_KEY });
    expect(objectStorageMock.getObject).toHaveBeenCalledWith({
      key: 'tax-report/document/winner.pdf',
    });
    expect(Buffer.from(actual.bytes).toString()).toBe('%PDF-winner');
  });

  it('links only a finalized report, and audits every download as one export', async () => {
    taxReportRepositoryMock.findReportById.mockResolvedValueOnce(buildReport({ status: 'DRAFT' }));
    await expect(service.createPdfDownloadUrl('report-sep', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    taxReportRepositoryMock.findReportById.mockResolvedValue(buildReport());
    documentRepositoryMock.findDocumentByReportId.mockResolvedValue(buildDocument());
    objectStorageMock.getSignedUrl.mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: '2026-10-01T02:00:00.000Z',
    });
    objectStorageMock.getObject.mockResolvedValue({ body: Buffer.from('%PDF-1') });

    const actual = await service.createPdfDownloadUrl('report-sep', actor);
    await service.renderPdf('report-sep', actor);

    expect(actual).toEqual({
      url: 'https://storage.example/signed',
      fileName: 'pajak-pp55-omzet-2026-09.pdf',
      expiresAt: '2026-10-01T02:00:00.000Z',
    });
    expect(objectStorageMock.getSignedUrl).toHaveBeenCalledWith({
      key: STORAGE_KEY,
      responseContentDisposition: 'attachment; filename="pajak-pp55-omzet-2026-09.pdf"',
      responseContentType: 'application/pdf',
    });
    expect(pdfRendererMock.render).not.toHaveBeenCalled();
    expect(auditServiceMock.record).toHaveBeenCalledTimes(2);
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXPORT',
        resource: 'tax-report',
        resourceId: 'report-sep',
      }),
    );
  });
});
