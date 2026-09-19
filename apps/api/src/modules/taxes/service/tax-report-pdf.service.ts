import { createHash } from 'node:crypto';

import {
  BuildTaxReportPdfHtmlParams,
  TAX_REPORT_NOT_FINALIZED_ERROR_CODE,
  TAX_REPORT_PDF_UNAVAILABLE_ERROR_CODE,
  TaxReportDocumentRecord,
  TaxReportPdf,
  TaxReportPdfDownloadView,
  TaxReportRecord,
} from '@hms/shared-types';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { TaxReportDocumentRepository } from '../repository/tax-report-document.repository';
import { buildTaxReportPdfFooterHtml } from './build-tax-report-pdf-footer-html';
import { buildTaxReportPdfHtml } from './build-tax-report-pdf-html';
import { createTaxReportPdfFormatter } from './create-tax-report-pdf-formatter';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const TAX_REPORT_AUDIT_RESOURCE = 'tax-report';
const TAX_REPORT_DOCUMENT_STORAGE_KEY_PREFIX = 'tax-report/document';
const PDF_CONTENT_TYPE = 'application/pdf';
/** A4 portrait; the bottom margin holds the two-line footer. */
const PAGE_MARGIN_INCHES = { top: 0.6, right: 0.6, bottom: 0.9, left: 0.6 } as const;

/**
 * The PDF of a monthly tax report (P27-T12), for the owner and the clinic's
 * accountant to file, sign and share.
 *
 * A DRAFT is rendered on every request with a DRAFT watermark and never
 * stored: its figures can still change. A FINALIZED report is rendered once
 * and stored, and every later download is that file — byte for byte, with no
 * second trip to the renderer. The stored file is never rewritten; when the
 * books change after finalizing, the report page shows the difference, not
 * the PDF. Every download is audited as an export.
 */
@Injectable()
export class TaxReportPdfService {
  private readonly logger = new Logger(TaxReportPdfService.name);
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxReportRepository: TaxReportRepository,
    private readonly taxReportDocumentRepository: TaxReportDocumentRepository,
    private readonly taxProfileService: TaxProfileService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /** The PDF bytes: a fresh watermarked render for a DRAFT, the stored file once final. */
  async renderPdf(id: string, actor: CurrentUser): Promise<TaxReportPdf> {
    const report = await this.findReportOrThrow(id);
    const bytes =
      report.status === 'DRAFT'
        ? await this.renderDraft(report)
        : await this.readStoredPdf(await this.ensureStoredDocument(report));
    await this.recordExport(report, actor);
    return { fileName: this.buildFileName(report), bytes };
  }

  /** A signed link to a finalized report's stored PDF; a DRAFT has none. */
  async createPdfDownloadUrl(id: string, actor: CurrentUser): Promise<TaxReportPdfDownloadView> {
    const report = await this.findReportOrThrow(id);
    if (report.status === 'DRAFT') {
      throw new ConflictException({
        code: TAX_REPORT_NOT_FINALIZED_ERROR_CODE,
        message: 'Only a finalized report has a stored PDF; download the draft directly',
      });
    }
    const document = await this.ensureStoredDocument(report);
    const fileName = this.buildFileName(report);
    const signed = await this.objectStorageService.getSignedUrl({
      key: this.readStorageKey(document),
      responseContentDisposition: `attachment; filename="${fileName}"`,
      responseContentType: PDF_CONTENT_TYPE,
    });
    await this.recordExport(report, actor);
    return { url: signed.url, fileName, expiresAt: signed.expiresAt };
  }

  /**
   * The READY document, rendering and storing it first when there is none
   * or the last attempt FAILED. A concurrent render that stores first wins,
   * and this one's bytes are discarded, so there is only ever one file.
   */
  private async ensureStoredDocument(report: TaxReportRecord): Promise<TaxReportDocumentRecord> {
    const existing = await this.taxReportDocumentRepository.findDocumentByReportId(report.id);
    if (existing?.status === 'READY') {
      return existing;
    }
    await this.renderAndStore(report);
    const stored = await this.taxReportDocumentRepository.findDocumentByReportId(report.id);
    if (stored?.status !== 'READY') {
      throw this.buildUnavailableError();
    }
    return stored;
  }

  private async renderAndStore(report: TaxReportRecord): Promise<void> {
    try {
      const body = Buffer.from(await this.renderReport(report));
      const storageKey = this.objectStorageService.generateObjectKey({
        keyPrefix: TAX_REPORT_DOCUMENT_STORAGE_KEY_PREFIX,
        fileExtension: 'pdf',
      });
      await this.objectStorageService.uploadObject({
        key: storageKey,
        body,
        contentType: PDF_CONTENT_TYPE,
      });
      const isSaved = await this.taxReportDocumentRepository.saveReadyDocument({
        reportId: report.id,
        storageKey,
        checksum: createHash('sha256').update(body).digest('hex'),
        sizeBytes: body.byteLength,
        renderedAt: new Date(),
      });
      if (!isSaved) {
        await this.discardObjectQuietly(storageKey);
      }
    } catch (err: unknown) {
      await this.recordRenderFailure(report, err);
      throw this.buildUnavailableError();
    }
  }

  private async renderDraft(report: TaxReportRecord): Promise<Uint8Array> {
    try {
      return await this.renderReport(report);
    } catch {
      this.logger.warn(buildSafeErrorLog('tax_report_pdf_render_failed', { reportId: report.id }));
      throw this.buildUnavailableError();
    }
  }

  private async renderReport(report: TaxReportRecord): Promise<Uint8Array> {
    const [letterhead, settings, actors] = await Promise.all([
      this.clinicProfileService.getLetterhead(),
      this.taxProfileService.getTaxSettings(),
      this.taxReportRepository.findReportActorNames(report.id),
    ]);
    const params: BuildTaxReportPdfHtmlParams = {
      context: {
        report,
        letterhead,
        nitku: settings.nitku,
        actors,
        renderedAt: new Date(),
        timeZone: this.clinicTimeZone,
      },
      format: createTaxReportPdfFormatter(this.clinicTimeZone),
    };
    return this.pdfRendererService.render(buildTaxReportPdfHtml(params), {
      footerHtml: buildTaxReportPdfFooterHtml(params),
      marginInches: PAGE_MARGIN_INCHES,
      printBackground: true,
      traceId: report.id,
    });
  }

  private async readStoredPdf(document: TaxReportDocumentRecord): Promise<Uint8Array> {
    const stored = await this.objectStorageService.getObject({
      key: this.readStorageKey(document),
    });
    return new Uint8Array(stored.body);
  }

  private readStorageKey(document: TaxReportDocumentRecord): string {
    if (document.storageKey === null) {
      throw this.buildUnavailableError();
    }
    return document.storageKey;
  }

  private async recordRenderFailure(report: TaxReportRecord, err: unknown): Promise<void> {
    const failureReason =
      err instanceof Error && err.message.startsWith('PDF renderer')
        ? err.message
        : 'The PDF could not be rendered or stored — retry after checking the renderer and storage';
    await this.taxReportDocumentRepository.saveFailedDocument({
      reportId: report.id,
      failureReason,
    });
    this.logger.warn(
      buildSafeErrorLog('tax_report_pdf_render_failed', { reportId: report.id, failureReason }),
    );
  }

  private async discardObjectQuietly(key: string): Promise<void> {
    try {
      await this.objectStorageService.deleteObject({ key });
    } catch {
      this.logger.warn(buildSafeErrorLog('tax_report_pdf_orphan_object', { key }));
    }
  }

  private async findReportOrThrow(id: string): Promise<TaxReportRecord> {
    const report = await this.taxReportRepository.findReportById(id);
    if (!report) {
      throw new NotFoundException('Tax report not found');
    }
    return report;
  }

  private async recordExport(report: TaxReportRecord, actor: CurrentUser): Promise<void> {
    await this.auditService.record({
      action: 'EXPORT',
      resource: TAX_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      actorUserId: actor.sub,
      metadata: { period: report.period, kind: report.kind, status: report.status, format: 'PDF' },
    });
  }

  private buildFileName(report: TaxReportRecord): string {
    const kind = report.kind.toLowerCase().replace('_', '-');
    const suffix = report.status === 'DRAFT' ? '-draft' : '';
    return `pajak-${kind}-${report.period}${suffix}.pdf`;
  }

  private buildUnavailableError(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: TAX_REPORT_PDF_UNAVAILABLE_ERROR_CODE,
      message: 'The PDF could not be produced right now; try again shortly',
    });
  }
}
