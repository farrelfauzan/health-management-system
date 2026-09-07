import {
  ClinicalRequestDocumentView,
  ClinicalRequestRenderContext,
  TemplateSettingsValue,
} from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { PdfRenderOptions, PdfRendererService } from '../../../common/pdf';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { DocumentTemplateService } from '../../document-template/service/document-template.service';
import { ClinicalRequestDocumentRepository } from '../repository/clinical-request-document.repository';
import { BUILT_IN_CLINICAL_REQUEST_TEMPLATES } from './built-in-clinical-request-templates';
import { buildClinicalRequestHtml } from './build-clinical-request-html';

const PDF_CONTENT_TYPE = 'application/pdf';

const CLINICAL_REQUEST_STORAGE_KEY_PREFIX = 'clinical-request/document';

const MILLIMETRES_PER_INCH = 25.4;

const PAPER_DIMENSIONS_INCHES: Readonly<
  Record<TemplateSettingsValue['paperSize'], { width: number; height: number }>
> = {
  A4: { width: 8.27, height: 11.69 },
  A5: { width: 5.83, height: 8.27 },
  LETTER: { width: 8.5, height: 11 },
};

/**
 * Renders a clinical request as the paper the patient carries, and files it
 * (`P18-T12`).
 *
 * It knows nothing about lab orders or prescriptions: the module that owns each
 * record gathers the context and this places it. That is what keeps the rules
 * about an order in one place — a renderer that reached into the laboratory to
 * decide what to print would become a second opinion about what was ordered.
 *
 * Rendering reuses the invoice pipeline's parts — the published template
 * version, the Gotenberg port, object storage — rather than growing a second
 * renderer, which is the whole reason `DocumentTemplateKind` gained two values
 * instead of this module gaining its own layout engine.
 */
@Injectable()
export class ClinicalRequestDocumentService {
  private readonly logger = new Logger(ClinicalRequestDocumentService.name);

  constructor(
    private readonly clinicalRequestDocumentRepository: ClinicalRequestDocumentRepository,
    private readonly documentTemplateService: DocumentTemplateService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Renders and files the request, replacing the stored bytes when it has been
   * printed before. Every print is audited, not only the first: a lost letter is
   * routine, and "how many copies of this resep exist" is a question a
   * pharmacist eventually asks.
   */
  async renderAndFile(
    context: ClinicalRequestRenderContext,
    actorUserId: string,
  ): Promise<ClinicalRequestDocumentView> {
    const layout = await this.resolveLayout(context.kind);
    const html = buildClinicalRequestHtml({
      contentHtml: layout.contentHtml,
      values: context.values,
      lines: context.lines,
    });
    const bytes = await this.pdfRendererService.render(
      html,
      this.buildRenderOptions(layout.settings),
    );
    const body = Buffer.from(bytes);
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: CLINICAL_REQUEST_STORAGE_KEY_PREFIX,
      fileExtension: 'pdf',
    });
    await this.objectStorageService.uploadObject({
      key: storageKey,
      body,
      contentType: PDF_CONTENT_TYPE,
    });
    const filed = await this.clinicalRequestDocumentRepository.fileDocument({
      context,
      storageKey,
      sizeBytes: body.byteLength,
      uploadedById: actorUserId,
    });
    await this.auditService.record({
      action: context.kind === 'LAB_REQUEST' ? 'LAB_REQUEST_PRINTED' : 'PRESCRIPTION_PRINTED',
      resource: context.kind === 'LAB_REQUEST' ? 'LabOrder' : 'Prescription',
      resourceId: context.subjectId,
      actorUserId,
      patientId: context.patientId,
      metadata: { documentId: filed.id, printCount: filed.printCount },
    });

    return {
      documentId: filed.id,
      kind: context.kind,
      title: context.title,
      printCount: filed.printCount,
      renderedAt: new Date().toISOString(),
    };
  }

  /**
   * A clinic-published template when one exists, the shipped layout otherwise.
   *
   * The built-in is not a fallback for failure — it is the layout a clinic that
   * has never opened the editor prints on, which is every clinic on its first
   * day.
   */
  private async resolveLayout(
    kind: ClinicalRequestRenderContext['kind'],
  ): Promise<{ contentHtml: string; settings: TemplateSettingsValue }> {
    const published = await this.documentTemplateService.findDefaultPublishedVersion(kind);
    if (published === null) {
      return BUILT_IN_CLINICAL_REQUEST_TEMPLATES[kind];
    }

    return { contentHtml: published.contentHtml, settings: published.settings };
  }

  private buildRenderOptions(settings: TemplateSettingsValue): PdfRenderOptions {
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
    };
  }

  private toInches(millimetres: number): number {
    return Math.round((millimetres / MILLIMETRES_PER_INCH) * 100) / 100;
  }
}
