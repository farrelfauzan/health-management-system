import { createHash } from 'node:crypto';

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';

import {
  ClinicProfileRecord,
  InvoiceDocumentDownloadView,
  InvoiceDocumentRecord,
  InvoiceDocumentView,
  InvoiceRenderContextRecord,
  PaperSizeValue,
  ResolvedInvoiceVariables,
  TemplateSettingsValue,
  TemplateVariableWarning,
} from '@hms/shared-types';

import { PdfRenderOptions } from '../../../common/pdf/pdf.types';
import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { DocumentTemplateService } from '../../document-template/service/document-template.service';
import { ClinicProfileRepository } from '../repository/clinic-profile.repository';
import { InvoiceDocumentRepository } from '../repository/invoice-document.repository';
import { buildInvoiceDocumentHtml } from './build-invoice-document-html';
import { BUILT_IN_INVOICE_TEMPLATE } from './built-in-invoice-template';
import { countStayNights } from './count-stay-nights';
import { InvoiceDocumentMapper } from './invoice-document.mapper';
import { INVOICE_DOCUMENT_STORAGE_KEY_PREFIX } from './invoice-document-storage-key-prefix';
import { resolveInvoiceVariables } from './resolve-invoice-variables';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const PDF_CONTENT_TYPE = 'application/pdf';

const MILLIMETRES_PER_INCH = 25.4;

/** NIK is 16 digits nationally; 12 of them stay masked on every surface. */
const NIK_MASKED_DIGIT_COUNT = 12;

const NIK_MASK_CHARACTER = '•';

const PAPER_DIMENSIONS_INCHES: Readonly<
  Record<PaperSizeValue, { readonly width: number; readonly height: number }>
> = {
  A4: { width: 8.27, height: 11.69 },
  A5: { width: 5.83, height: 8.27 },
  LETTER: { width: 8.5, height: 11 },
};

/**
 * The render pipeline (`P16-T06`): resolve → fill → sidecar → S3 → checksum.
 *
 * Two invariants carry the whole design:
 *
 *   * **Issuing snapshots the render** (FR-E1-09). The row pins the template
 *     version and the fully resolved values, so a later template edit, tariff
 *     reprice, or patient rename cannot change what a re-render produces —
 *     and a re-download never re-renders at all, it serves the stored bytes.
 *   * **Billing is never blocked by rendering.** The renderer failing, the
 *     bucket failing, or the sidecar being absent marks the row FAILED with a
 *     reason; recording a payment does not pass through this service, and the
 *     issue-time snapshot is best-effort with the first render request as its
 *     fallback.
 *
 * The row is also where identifiers stop: the context read fetches
 * `nikLast4` only, and the masked value is reconstructed from it — no
 * plaintext NIK exists anywhere in this pipeline, which is stronger than
 * masking one.
 */
@Injectable()
export class InvoiceDocumentService {
  private readonly logger = new Logger(InvoiceDocumentService.name);
  private readonly clinicTimeZone: string;

  constructor(
    private readonly invoiceDocumentRepository: InvoiceDocumentRepository,
    private readonly clinicProfileRepository: ClinicProfileRepository,
    private readonly documentTemplateService: DocumentTemplateService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly invoiceDocumentMapper: InvoiceDocumentMapper,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * Cuts the snapshot row when an invoice is issued. Best-effort by design: a
   * failure here must not fail the issue, so it logs and returns — the first
   * render request re-cuts the snapshot, marked retroactive.
   */
  async snapshotOnIssue(invoiceId: string): Promise<void> {
    try {
      const context = await this.invoiceDocumentRepository.findRenderContext(invoiceId);
      if (context === null || context.invoice.status !== 'ISSUED') {
        return;
      }
      await this.ensureDocumentRow(context, {
        hasVoidWatermark: false,
        wasBoundRetroactively: false,
      });
    } catch {
      this.logger.warn(buildSafeErrorLog('invoice_document_snapshot_failed', { invoiceId }));
    }
  }

  /**
   * Renders the invoice document, or returns the existing one — idempotent
   * per (invoice, snapshotted template version, watermark). A FAILED row is
   * retried; a READY row is returned without touching the renderer, which is
   * what makes two downloads byte-identical for free.
   */
  async requestRender(invoiceId: string): Promise<InvoiceDocumentView> {
    const context = await this.findRenderContextOrThrow(invoiceId);
    if (context.invoice.status === 'DRAFT') {
      throw new ConflictException('Issue the invoice first');
    }
    const hasVoidWatermark = context.invoice.status === 'VOID';
    let document = await this.invoiceDocumentRepository.findLatestDocument(
      invoiceId,
      hasVoidWatermark,
    );
    if (document === null) {
      document = await this.ensureDocumentRow(context, {
        hasVoidWatermark,
        // A missing snapshot on a non-void invoice means it was issued before
        // this feature existed (or the issue-time snapshot failed): the
        // binding to today's template is retroactive and the row says so.
        wasBoundRetroactively: !hasVoidWatermark,
      });
    }
    if (document.status === 'READY') {
      return this.invoiceDocumentMapper.toView(document);
    }
    const rendered = await this.executeRender(document, context);
    return this.invoiceDocumentMapper.toView(rendered);
  }

  async getDocument(invoiceId: string): Promise<InvoiceDocumentView> {
    const context = await this.findRenderContextOrThrow(invoiceId);
    const hasVoidWatermark = context.invoice.status === 'VOID';
    const document = await this.invoiceDocumentRepository.findLatestDocument(
      invoiceId,
      hasVoidWatermark,
    );
    if (document === null) {
      throw new NotFoundException('No document has been rendered for this invoice');
    }
    return this.invoiceDocumentMapper.toView(document);
  }

  async createDownloadUrl(invoiceId: string): Promise<InvoiceDocumentDownloadView> {
    const context = await this.findRenderContextOrThrow(invoiceId);
    const hasVoidWatermark = context.invoice.status === 'VOID';
    const document = await this.invoiceDocumentRepository.findLatestDocument(
      invoiceId,
      hasVoidWatermark,
    );
    if (document === null) {
      throw new NotFoundException('No document has been rendered for this invoice');
    }
    if (document.status !== 'READY' || document.storageKey === null) {
      throw new ConflictException('The invoice document is not ready to download');
    }
    const fileName = this.buildDownloadFileName(context.invoice.invoiceNumber);
    const signed = await this.objectStorageService.getSignedUrl({
      key: document.storageKey,
      responseContentDisposition: `attachment; filename="${fileName}"`,
      responseContentType: PDF_CONTENT_TYPE,
    });
    return { url: signed.url, fileName, expiresAt: signed.expiresAt };
  }

  private async findRenderContextOrThrow(invoiceId: string): Promise<InvoiceRenderContextRecord> {
    const context = await this.invoiceDocumentRepository.findRenderContext(invoiceId);
    if (context === null) {
      throw new NotFoundException('Invoice not found');
    }
    return context;
  }

  /**
   * Creates the snapshot row for one render slot, or adopts the one a
   * concurrent request created first — the partial unique index makes the
   * race a read, exactly the "loser reads the winner's row" behaviour the
   * double-render edge case calls for.
   */
  private async ensureDocumentRow(
    context: InvoiceRenderContextRecord,
    slot: { hasVoidWatermark: boolean; wasBoundRetroactively: boolean },
  ): Promise<InvoiceDocumentRecord> {
    const version = await this.documentTemplateService.findDefaultPublishedVersion('INVOICE');
    const resolved = await this.resolveVariables(context);
    const renderWarnings: TemplateVariableWarning[] = [...resolved.warnings];
    if (version === null) {
      renderWarnings.push({
        token: 'template',
        reason: 'No published invoice template exists — the built-in layout was used',
      });
    }
    if (slot.wasBoundRetroactively) {
      renderWarnings.push({
        token: 'template',
        reason: 'This invoice predates document templates; its layout was bound retroactively',
      });
    }
    try {
      return await this.invoiceDocumentRepository.createDocument({
        invoiceId: context.invoice.id,
        templateVersionId: version?.id ?? null,
        hasVoidWatermark: slot.hasVoidWatermark,
        wasBoundRetroactively: slot.wasBoundRetroactively,
        renderedData: resolved,
        renderWarnings,
      });
    } catch (err: unknown) {
      if (this.isUniqueConstraintError(err)) {
        const existing = await this.invoiceDocumentRepository.findDocumentForSlot(
          context.invoice.id,
          version?.id ?? null,
          slot.hasVoidWatermark,
        );
        if (existing !== null) {
          return existing;
        }
      }
      throw err;
    }
  }

  /**
   * Produces and stores the bytes for one snapshot row. Every failure mode —
   * unreachable sidecar, oversized output, bucket refusal — lands as FAILED
   * with a reason on the row and never as a thrown 5xx: the response reports
   * the state, the UI offers retry, and nothing upstream is blocked.
   */
  private async executeRender(
    document: InvoiceDocumentRecord,
    context: InvoiceRenderContextRecord,
  ): Promise<InvoiceDocumentRecord> {
    try {
      const layout = await this.resolveLayout(document.templateVersionId);
      const html = buildInvoiceDocumentHtml({
        contentHtml: layout.contentHtml,
        resolved: document.renderedData,
        itemColumns: layout.settings.itemsColumns,
        watermark: {
          isVoid: document.hasVoidWatermark,
          reason: context.invoice.voidReason,
          voidedByName: context.voidedByName,
        },
      });
      const bytes = await this.pdfRendererService.render(
        html,
        this.buildRenderOptions(layout.settings, document.id),
      );
      const body = Buffer.from(bytes);
      const checksum = createHash('sha256').update(body).digest('hex');
      const pageCount = await this.countPdfPages(body);
      const storageKey = this.objectStorageService.generateObjectKey({
        keyPrefix: INVOICE_DOCUMENT_STORAGE_KEY_PREFIX,
        fileExtension: 'pdf',
      });
      await this.objectStorageService.uploadObject({
        key: storageKey,
        body,
        contentType: PDF_CONTENT_TYPE,
      });
      const wasCompleted = await this.invoiceDocumentRepository.completeRender({
        id: document.id,
        storageKey,
        checksum,
        sizeBytes: body.byteLength,
        pageCount,
        renderedAt: new Date(),
      });
      if (!wasCompleted) {
        // A concurrent render finished first; its bytes are the document.
        await this.discardObjectQuietly(storageKey);
      }
      return await this.rereadDocument(document.id);
    } catch (err: unknown) {
      const reason = this.toSafeRenderError(err);
      await this.invoiceDocumentRepository.failRender(document.id, reason);
      this.logger.warn(
        buildSafeErrorLog('invoice_document_render_failed', {
          invoiceDocumentId: document.id,
          reason,
        }),
      );
      return this.rereadDocument(document.id);
    }
  }

  private async resolveLayout(
    templateVersionId: string | null,
  ): Promise<{ contentHtml: string; settings: TemplateSettingsValue }> {
    if (templateVersionId === null) {
      return BUILT_IN_INVOICE_TEMPLATE;
    }
    const version = await this.documentTemplateService.findVersionById(templateVersionId);
    if (version === null) {
      // Version rows are immutable and only hard-deletable with the template
      // cascade; reaching this means the snapshot points at nothing and only
      // the fallback can still produce a document.
      return BUILT_IN_INVOICE_TEMPLATE;
    }
    return { contentHtml: version.contentHtml, settings: version.settings };
  }

  private buildRenderOptions(settings: TemplateSettingsValue, traceId: string): PdfRenderOptions {
    const paper = PAPER_DIMENSIONS_INCHES[settings.paperSize];
    return {
      paperWidthInches: paper.width,
      paperHeightInches: paper.height,
      landscape: settings.orientation === 'LANDSCAPE',
      marginInches: {
        top: this.toInches(settings.marginMm.top),
        right: this.toInches(settings.marginMm.right),
        bottom: this.toInches(settings.marginMm.bottom),
        left: this.toInches(settings.marginMm.left),
      },
      printBackground: true,
      traceId,
    };
  }

  private toInches(millimetres: number): number {
    return Math.round((millimetres / MILLIMETRES_PER_INCH) * 100) / 100;
  }

  private async resolveVariables(
    context: InvoiceRenderContextRecord,
  ): Promise<ResolvedInvoiceVariables> {
    const clinic = await this.clinicProfileRepository.findProfile();
    const logoDataUri = await this.readClinicLogo(clinic);
    return resolveInvoiceVariables({
      timeZone: this.clinicTimeZone,
      clinic:
        clinic === null
          ? null
          : {
              name: clinic.name,
              legalName: clinic.legalName,
              address: clinic.address,
              phoneNumber: clinic.phoneNumber,
              email: clinic.email,
              licenseNumber: clinic.licenseNumber,
              taxId: clinic.taxId,
              logoDataUri,
            },
      invoice: {
        invoiceNumber: context.invoice.invoiceNumber,
        status: context.invoice.status,
        totalAmount: context.invoice.totalAmount,
        issuedAt: context.invoice.issuedAt,
        // FR-E1-14 (verification QR) is SHOULD-scope and lands with its own
        // generator; until then the token resolves empty with a warning.
        qrVerifyDataUri: null,
      },
      patient:
        context.patient === null
          ? null
          : {
              fullName: context.patient.fullName,
              mrn: context.patient.mrn,
              dateOfBirth: context.patient.dateOfBirth,
              sex: context.patient.sex,
              address: context.patient.address,
              phoneNumber: context.patient.phoneNumber,
              nik: this.reconstructMaskableNik(context.patient.nikLast4),
            },
      encounter:
        context.encounter === null
          ? null
          : {
              date: context.encounter.startedAt,
              doctorName: context.encounter.doctorName,
              specialty: context.encounter.specialtyName,
            },
      admission:
        context.admission === null
          ? null
          : {
              roomLabel: context.admission.roomLabel,
              nights: countStayNights({
                admittedAt: context.admission.admittedAt,
                endedAt: context.admission.dischargedAt ?? new Date(),
                timeZone: this.clinicTimeZone,
              }),
            },
      payment:
        context.payment === null
          ? null
          : {
              method: context.payment.method,
              paidAt: context.payment.paidAt,
              referenceNumber: context.payment.referenceNumber,
              cashierName: context.payment.cashierName,
            },
      items: context.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })),
    });
  }

  /**
   * The resolver masks all but the last four characters of whatever NIK it is
   * handed. Handing it twelve mask characters plus `nikLast4` produces the
   * identical masked output without this pipeline ever reading the
   * ciphertext — the strongest form of "decrypts what it is permitted to
   * decrypt" is decrypting nothing.
   */
  private reconstructMaskableNik(nikLast4: string | null): string | null {
    if (nikLast4 === null || nikLast4.trim() === '') {
      return null;
    }
    return `${NIK_MASK_CHARACTER.repeat(NIK_MASKED_DIGIT_COUNT)}${nikLast4.trim()}`;
  }

  private async readClinicLogo(clinic: ClinicProfileRecord | null): Promise<string | null> {
    if (clinic === null || clinic.logoStorageKey === null) {
      return null;
    }
    try {
      const stored = await this.objectStorageService.getObject({ key: clinic.logoStorageKey });
      const mimeType = clinic.logoMimeType ?? stored.contentType ?? 'image/png';
      return `data:${mimeType};base64,${stored.body.toString('base64')}`;
    } catch {
      // A missing logo renders without it plus a warning from the resolver —
      // never a failed PDF.
      this.logger.warn(
        buildSafeErrorLog('invoice_document_logo_unreadable', { key: clinic.logoStorageKey }),
      );
      return null;
    }
  }

  private async countPdfPages(body: Buffer): Promise<number | null> {
    const parser = new PDFParse({ data: new Uint8Array(body) });
    try {
      const parsed = await parser.getText({ pageJoiner: '' });
      return parsed.total ?? null;
    } catch {
      return null;
    } finally {
      await parser.destroy();
    }
  }

  private async rereadDocument(id: string): Promise<InvoiceDocumentRecord> {
    const document = await this.invoiceDocumentRepository.findDocumentById(id);
    if (document === null) {
      throw new NotFoundException('Invoice document not found');
    }
    return document;
  }

  private async discardObjectQuietly(key: string): Promise<void> {
    try {
      await this.objectStorageService.deleteObject({ key });
    } catch {
      this.logger.warn(buildSafeErrorLog('invoice_document_orphan_object', { key }));
    }
  }

  private buildDownloadFileName(invoiceNumber: string): string {
    const compactNumber = invoiceNumber.replaceAll('/', '-');
    const safeNumber = compactNumber.replaceAll(/[^A-Za-z0-9._-]/g, '_');
    return `${safeNumber}.pdf`;
  }

  private toSafeRenderError(err: unknown): string {
    if (err instanceof Error && err.message.startsWith('PDF renderer')) {
      // The adapter's own messages are deliberately body-free and safe to
      // persist; anything else gets a generic line so an upstream error text
      // can never echo invoice content into the row.
      return err.message;
    }
    return 'The document could not be rendered — retry after checking the renderer and storage';
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
    );
  }
}
