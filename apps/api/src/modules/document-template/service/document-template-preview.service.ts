import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DocumentTemplatePreviewView,
  DocumentTemplateWithLatestVersionRecord,
  PaperSizeValue,
  TemplateSettingsValue,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { PdfRenderOptions } from '../../../common/pdf/pdf.types';
import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { buildInvoiceDocumentHtml } from '../../billing/service/build-invoice-document-html';
import { resolveMateraiThresholdIdr } from '../../billing/service/materai-threshold';
import { resolveInvoiceVariables } from '../../billing/service/resolve-invoice-variables';
import { shouldShowMateraiArea } from '../../billing/service/should-show-materai-area';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import { buildInvoicePreviewFixture } from './invoice-preview-fixture';

const TEMPLATE_AUDIT_RESOURCE = 'document-template';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const PDF_CONTENT_TYPE = 'application/pdf';

const MILLIMETRES_PER_INCH = 25.4;

/**
 * Its own prefix, apart from `invoices/documents/`: a preview is a throwaway
 * that must never be mistaken for — or listed alongside — a rendered bill.
 */
export const TEMPLATE_PREVIEW_STORAGE_KEY_PREFIX = 'document-templates/previews';

/** Long enough to read the PDF, short enough that the link is worthless by lunch. */
const PREVIEW_URL_EXPIRES_IN_SECONDS = 300;

const PAPER_DIMENSIONS_INCHES: Readonly<
  Record<PaperSizeValue, { readonly width: number; readonly height: number }>
> = {
  A4: { width: 8.27, height: 11.69 },
  A5: { width: 5.83, height: 8.27 },
  LETTER: { width: 8.5, height: 11 },
};

/**
 * Renders the working copy against the hostile fixture (`P16-T12`,
 * FR-E1-06). Three rules hold:
 *
 *   * **No patient data.** The fixture is code; this path reads the template
 *     row and nothing else.
 *   * **Nothing persisted against an invoice.** No `InvoiceDocument` row is
 *     created; the bytes land under a preview-only prefix and the caller
 *     gets a URL that expires in minutes.
 *   * **Never blocks anything.** A renderer or bucket failure surfaces as the
 *     adapter's service error for the one request that wanted a preview.
 */
@Injectable()
export class DocumentTemplatePreviewService {
  private readonly clinicTimeZone: string;
  private readonly materaiThresholdIdr: number;

  constructor(
    private readonly documentTemplateRepository: DocumentTemplateRepository,
    private readonly pdfRendererService: PdfRendererService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
    this.materaiThresholdIdr = resolveMateraiThresholdIdr(configService);
  }

  async previewTemplate(id: string, actor: CurrentUser): Promise<DocumentTemplatePreviewView> {
    const template = await this.documentTemplateRepository.findById(id);
    if (template === null) {
      throw new NotFoundException('Document template not found');
    }
    return this.renderPreview({
      template,
      contentHtml: template.contentHtml,
      actor,
      event: 'TEMPLATE_PREVIEWED',
    });
  }

  /**
   * The approver's view of a template submission (`P16-T32`, FR-E5-21).
   *
   * The caller supplies the **frozen** HTML from the round rather than an id
   * to re-read, and that is the whole point: a drafter who edits after
   * submitting changes the working copy and nothing the approver sees. The
   * frozen copy was sanitised at write time, so it enters the renderer under
   * the same guarantee the working copy does.
   */
  async previewSubmittedHtml(params: {
    templateId: string;
    contentHtml: string;
    actor: CurrentUser;
  }): Promise<DocumentTemplatePreviewView> {
    const template = await this.documentTemplateRepository.findById(params.templateId);
    if (template === null) {
      throw new NotFoundException('Document template not found');
    }
    return this.renderPreview({
      template,
      contentHtml: params.contentHtml,
      actor: params.actor,
      event: 'TEMPLATE_SUBMISSION_PREVIEWED',
    });
  }

  private async renderPreview(params: {
    template: DocumentTemplateWithLatestVersionRecord;
    contentHtml: string;
    actor: CurrentUser;
    event: string;
  }): Promise<DocumentTemplatePreviewView> {
    const { template, actor } = params;
    const fixture = buildInvoicePreviewFixture(this.clinicTimeZone);
    const resolved = resolveInvoiceVariables(fixture);
    const html = buildInvoiceDocumentHtml({
      contentHtml: params.contentHtml,
      resolved,
      watermark: { isVoid: false, reason: null, voidedByName: null },
      itemColumns: template.settings.itemsColumns,
      showMateraiArea: shouldShowMateraiArea(fixture.invoice.totalAmount, this.materaiThresholdIdr),
    });
    const bytes = await this.pdfRendererService.render(
      html,
      this.buildRenderOptions(template.settings, `preview:${template.id}`),
    );
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: TEMPLATE_PREVIEW_STORAGE_KEY_PREFIX,
      fileExtension: 'pdf',
    });
    await this.objectStorageService.uploadObject({
      key: storageKey,
      body: Buffer.from(bytes),
      contentType: PDF_CONTENT_TYPE,
    });
    const signed = await this.objectStorageService.getSignedUrl({
      key: storageKey,
      expiresInSeconds: PREVIEW_URL_EXPIRES_IN_SECONDS,
      // Inline, unlike every uploaded file: this PDF was produced by the
      // sidecar from sanitised HTML, not uploaded by a user, and the whole
      // point is to look at it inside the editor.
      responseContentDisposition: 'inline; filename="template-preview.pdf"',
      responseContentType: PDF_CONTENT_TYPE,
    });
    await this.auditService.record({
      action: 'READ',
      resource: TEMPLATE_AUDIT_RESOURCE,
      resourceId: template.id,
      actorUserId: actor.sub,
      metadata: { event: params.event, warningCount: resolved.warnings.length },
    });
    return { url: signed.url, expiresAt: signed.expiresAt, warnings: [...resolved.warnings] };
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
}
