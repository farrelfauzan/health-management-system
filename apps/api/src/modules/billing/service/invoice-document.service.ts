import { createHash } from 'node:crypto';

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';

import {
  ClinicProfileRecord,
  InvoiceDeliverySubjectRecord,
  InvoiceDocumentBinding,
  InvoiceDocumentDownloadView,
  InvoiceDocumentRecord,
  InvoiceDocumentSlot,
  InvoiceDocumentView,
  InvoiceRenderContextRecord,
  InvoiceStatusValue,
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
import { resolveMateraiThresholdIdr } from './materai-threshold';
import { resolveInvoiceDocumentSlot } from './resolve-invoice-document-slot';
import { resolveInvoiceVariables } from './resolve-invoice-variables';
import { shouldShowMateraiArea } from './should-show-materai-area';
import { shouldShowTaxInclusiveNote } from './should-show-tax-inclusive-note';

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
 * Three invariants carry the whole design:
 *
 *   * **Issuing snapshots the render** (FR-E1-09). The row pins the template
 *     version and the fully resolved values, so a later template edit, tariff
 *     reprice, or patient rename cannot change what a re-render produces —
 *     and a re-download never re-renders at all, it serves the stored bytes.
 *   * **Each invoice state is its own document.** The ISSUED snapshot is
 *     never rewritten: paying the bill cuts a separate paid-receipt row
 *     (status PAID, method, reference, cashier) and voiding it a separate
 *     watermarked row. Every read picks the slot of the invoice's current
 *     state — VOID, then PAID, then ISSUED.
 *   * **Billing is never blocked by rendering.** The renderer failing, the
 *     bucket failing, or the sidecar being absent marks the row FAILED with a
 *     reason; the issue- and payment-time snapshots are best-effort with the
 *     first render request as their fallback.
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
  private readonly materaiThresholdIdr: number;

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
    this.materaiThresholdIdr = resolveMateraiThresholdIdr(configService);
  }

  /**
   * Cuts the snapshot row when an invoice is issued. Best-effort by design: a
   * failure here must not fail the issue, so it logs and returns — the first
   * render request re-cuts the snapshot, marked retroactive.
   */
  async snapshotOnIssue(invoiceId: string): Promise<void> {
    await this.snapshotQuietly(invoiceId, 'ISSUED', async () => ({
      templateVersionId: await this.findCurrentTemplateVersionId(),
      wasBoundRetroactively: false,
    }));
  }

  /**
   * Cuts the paid-receipt row when a payment is recorded, next to — never
   * over — the ISSUED snapshot (FR-E1-09). The receipt keeps the layout the
   * invoice was issued with. Best-effort like the issue-time snapshot: a
   * failure logs and the first render request cuts the receipt instead.
   */
  async snapshotOnPayment(invoiceId: string): Promise<void> {
    await this.snapshotQuietly(invoiceId, 'PAID', () => this.resolveReceiptBinding(invoiceId));
  }

  /**
   * Renders the invoice document, or returns the existing one — idempotent
   * per (invoice, snapshotted template version, slot), where the slot follows
   * the invoice's current state. A FAILED row is retried; a READY row is
   * returned without touching the renderer, which is what makes two
   * downloads byte-identical for free.
   */
  async requestRender(invoiceId: string): Promise<InvoiceDocumentView> {
    const context = await this.findRenderContextOrThrow(invoiceId);
    if (context.invoice.status === 'DRAFT') {
      throw new ConflictException('Issue the invoice first');
    }
    const slot = resolveInvoiceDocumentSlot(context.invoice.status);
    let document = await this.invoiceDocumentRepository.findLatestDocument(invoiceId, slot);
    if (document === null) {
      const binding = await this.resolveLateBinding(invoiceId, slot);
      document = await this.ensureDocumentRow(context, slot, binding);
    }
    if (document.status === 'READY') {
      return this.invoiceDocumentMapper.toView(document);
    }
    const rendered = await this.executeRender(document, context);
    return this.invoiceDocumentMapper.toView(rendered);
  }

  /** The metadata of the document for the invoice's current state. */
  async getDocument(invoiceId: string): Promise<InvoiceDocumentView> {
    const { record } = await this.findCurrentDocumentOrThrow(invoiceId);
    return this.invoiceDocumentMapper.toView(record);
  }

  /** A short-lived signed download of the document for the invoice's current state. */
  async createDownloadUrl(invoiceId: string): Promise<InvoiceDocumentDownloadView> {
    const { record: document, context } = await this.findCurrentDocumentOrThrow(invoiceId);
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

  /**
   * The facts a send is decided on (`P16-T25`, FR-E4-02). The rule itself —
   * ISSUED or PAID, and READY — lives in the delivery module; this only
   * refuses to answer for an invoice that does not exist.
   */
  async findDeliverySubject(
    invoiceId: string,
    invoiceDocumentId: string | null = null,
  ): Promise<InvoiceDeliverySubjectRecord> {
    const subject = await this.invoiceDocumentRepository.findDeliverySubject(
      invoiceId,
      invoiceDocumentId,
    );
    if (subject === null) {
      throw new NotFoundException('Invoice not found');
    }
    return subject;
  }

  /** The file name a delivered or downloaded invoice PDF is saved as. */
  buildFileName(invoiceNumber: string): string {
    return this.buildDownloadFileName(invoiceNumber);
  }

  private async findRenderContextOrThrow(invoiceId: string): Promise<InvoiceRenderContextRecord> {
    const context = await this.invoiceDocumentRepository.findRenderContext(invoiceId);
    if (context === null) {
      throw new NotFoundException('Invoice not found');
    }
    return context;
  }

  private async findCurrentDocumentOrThrow(
    invoiceId: string,
  ): Promise<{ record: InvoiceDocumentRecord; context: InvoiceRenderContextRecord }> {
    const context = await this.findRenderContextOrThrow(invoiceId);
    const record = await this.invoiceDocumentRepository.findLatestDocument(
      invoiceId,
      resolveInvoiceDocumentSlot(context.invoice.status),
    );
    if (record === null) {
      throw new NotFoundException('No document has been rendered for this invoice');
    }
    return { record, context };
  }

  /**
   * Cuts the row of one state transition unless the invoice has already
   * moved past it. Never throws: the transition that called it has already
   * committed and must not be reported as failed.
   */
  private async snapshotQuietly(
    invoiceId: string,
    expectedStatus: InvoiceStatusValue,
    resolveBinding: () => Promise<InvoiceDocumentBinding>,
  ): Promise<void> {
    try {
      const context = await this.invoiceDocumentRepository.findRenderContext(invoiceId);
      if (context === null || context.invoice.status !== expectedStatus) {
        return;
      }
      const slot = resolveInvoiceDocumentSlot(expectedStatus);
      await this.ensureDocumentRow(context, slot, await resolveBinding());
    } catch {
      this.logger.warn(buildSafeErrorLog('invoice_document_snapshot_failed', { invoiceId }));
    }
  }

  /**
   * The binding for a slot whose row is first asked for at render time. A
   * missing ISSUED snapshot means the invoice was issued before this feature
   * existed (or the issue-time snapshot failed): the binding to today's
   * template is retroactive and the row says so. A watermarked row is the
   * natural post-void document, never retroactive.
   */
  private async resolveLateBinding(
    invoiceId: string,
    slot: InvoiceDocumentSlot,
  ): Promise<InvoiceDocumentBinding> {
    if (slot.isPaidReceipt) {
      return this.resolveReceiptBinding(invoiceId);
    }
    return {
      templateVersionId: await this.findCurrentTemplateVersionId(),
      wasBoundRetroactively: !slot.hasVoidWatermark,
    };
  }

  /**
   * A receipt inherits the ISSUED snapshot's template version (FR-E1-09: a
   * republished template never reaches an invoice issued before it). With no
   * ISSUED snapshot to inherit from, the receipt binds today's template and
   * is marked retroactive, the same as a late ISSUED snapshot would be.
   */
  private async resolveReceiptBinding(invoiceId: string): Promise<InvoiceDocumentBinding> {
    const issued = await this.invoiceDocumentRepository.findLatestDocument(
      invoiceId,
      resolveInvoiceDocumentSlot('ISSUED'),
    );
    if (issued === null) {
      return {
        templateVersionId: await this.findCurrentTemplateVersionId(),
        wasBoundRetroactively: true,
      };
    }
    return {
      templateVersionId: issued.templateVersionId,
      wasBoundRetroactively: issued.wasBoundRetroactively,
    };
  }

  private async findCurrentTemplateVersionId(): Promise<string | null> {
    const version = await this.documentTemplateService.findDefaultPublishedVersion('INVOICE');
    return version?.id ?? null;
  }

  /**
   * Creates the snapshot row for one render slot, or adopts the one a
   * concurrent request created first — the partial unique index makes the
   * race a read, exactly the "loser reads the winner's row" behaviour the
   * double-render edge case calls for.
   */
  private async ensureDocumentRow(
    context: InvoiceRenderContextRecord,
    slot: InvoiceDocumentSlot,
    binding: InvoiceDocumentBinding,
  ): Promise<InvoiceDocumentRecord> {
    const resolved = await this.resolveVariables(context);
    const renderWarnings: TemplateVariableWarning[] = [...resolved.warnings];
    if (binding.templateVersionId === null) {
      renderWarnings.push({
        token: 'template',
        reason: 'No published invoice template exists — the built-in layout was used',
      });
    }
    if (binding.wasBoundRetroactively) {
      renderWarnings.push({
        token: 'template',
        reason: 'This invoice predates document templates; its layout was bound retroactively',
      });
    }
    try {
      return await this.invoiceDocumentRepository.createDocument({
        invoiceId: context.invoice.id,
        templateVersionId: binding.templateVersionId,
        hasVoidWatermark: slot.hasVoidWatermark,
        isPaidReceipt: slot.isPaidReceipt,
        wasBoundRetroactively: binding.wasBoundRetroactively,
        renderedData: resolved,
        renderWarnings,
      });
    } catch (err: unknown) {
      if (this.isUniqueConstraintError(err)) {
        const existing = await this.invoiceDocumentRepository.findDocumentForSlot(
          context.invoice.id,
          binding.templateVersionId,
          slot,
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
        showMateraiArea: shouldShowMateraiArea(
          context.invoice.totalAmount,
          this.materaiThresholdIdr,
        ),
        showTaxNote: shouldShowTaxInclusiveNote(context.invoice.taxAmount),
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
