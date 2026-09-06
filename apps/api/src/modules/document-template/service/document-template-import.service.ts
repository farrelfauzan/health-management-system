import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CreateDocumentTemplateImportUploadUrlInput,
  DOCUMENT_TEMPLATE_IMPORT_MAX_UPLOAD_SIZE_BYTES,
  DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE,
  DocumentTemplateImportUploadUrlView,
  DocumentTemplateImportView,
  ImportDocumentTemplateInput,
  MAX_TEMPLATE_CONTENT_HTML_LENGTH,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import { convertDocxToTemplateHtml } from './convert-docx-to-template-html';
import { sanitiseRichTextHtml } from '../../../common/html/sanitise-rich-text-html';
import {
  isStagedTemplateImportKey,
  TEMPLATE_IMPORT_STAGED_KEY_PREFIX,
} from './template-import-storage-key';
import { validateDocxContent } from './validate-docx-content';

const TEMPLATE_AUDIT_RESOURCE = 'document-template';

export const DOCUMENT_TEMPLATE_IMPORT_TOO_LARGE_CODE = 'DOCUMENT_TEMPLATE_IMPORT_TOO_LARGE';

/**
 * Template import from Word (`P16-T42`).
 *
 * The file never transits the API: {@link createImportUploadUrl} signs one
 * browser-direct PUT, and {@link importTemplate} reads the staged object
 * back, refuses it on its bytes if it is not a Word file, converts it, and
 * deletes it — whatever the outcome. Nothing is written to the template:
 * the converted layout goes back to the editor as an unsaved draft, and the
 * working copy changes only when the author saves. Undo is closing the tab.
 */
@Injectable()
export class DocumentTemplateImportService {
  private readonly logger = new Logger(DocumentTemplateImportService.name);

  constructor(
    private readonly documentTemplateRepository: DocumentTemplateRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  async createImportUploadUrl(
    input: CreateDocumentTemplateImportUploadUrlInput,
  ): Promise<DocumentTemplateImportUploadUrlView> {
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: TEMPLATE_IMPORT_STAGED_KEY_PREFIX,
      fileExtension: 'docx',
    });
    const signedUpload = await this.objectStorageService.getSignedUploadUrl({
      key: storageKey,
      contentType: DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE,
      contentLengthBytes: input.sizeBytes,
    });
    return {
      url: signedUpload.url,
      storageKey: signedUpload.key,
      expiresAt: signedUpload.expiresAt,
      requiredHeaders: signedUpload.requiredHeaders,
    };
  }

  async importTemplate(
    id: string,
    input: ImportDocumentTemplateInput,
    actor: CurrentUser,
  ): Promise<DocumentTemplateImportView> {
    const template = await this.documentTemplateRepository.findById(id);
    if (template === null) {
      throw new NotFoundException('Document template not found');
    }
    if (!isStagedTemplateImportKey(input.stagedKey)) {
      throw new BadRequestException('stagedKey is not a staged template import');
    }
    try {
      const content = await this.readStagedObject(input.stagedKey);
      const verdict = validateDocxContent(content);
      if (!verdict.isAccepted) {
        await this.rejectStagedImport(input.stagedKey, verdict.reason, actor);
      }
      const converted = await convertDocxToTemplateHtml(content);
      const contentHtml = sanitiseRichTextHtml(converted.html);
      if (contentHtml.length > MAX_TEMPLATE_CONTENT_HTML_LENGTH) {
        throw new UnprocessableEntityException({
          message:
            'The converted layout is too large for a template; reduce the images and try again',
          code: DOCUMENT_TEMPLATE_IMPORT_TOO_LARGE_CODE,
        });
      }
      await this.auditService.record({
        action: 'READ',
        resource: TEMPLATE_AUDIT_RESOURCE,
        resourceId: template.id,
        actorUserId: actor.sub,
        metadata: {
          event: 'TEMPLATE_IMPORTED',
          storageKey: input.stagedKey,
          warningCount: converted.warnings.length,
        },
      });
      return { contentHtml, warnings: converted.warnings };
    } finally {
      await this.discardStagedObjectQuietly(input.stagedKey);
    }
  }

  private async readStagedObject(stagedKey: string): Promise<Uint8Array> {
    const metadata = await this.objectStorageService.headObject({ key: stagedKey });
    if (metadata.sizeBytes <= 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    // Re-checked against the stored object rather than trusted from the
    // signing call: the size that was signed bounds the PUT, but this is the
    // number that decides how many bytes the converter is handed.
    if (metadata.sizeBytes > DOCUMENT_TEMPLATE_IMPORT_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('Uploaded file is larger than the permitted size');
    }
    const storedObject = await this.objectStorageService.getObject({ key: stagedKey });
    return storedObject.body;
  }

  private async rejectStagedImport(
    stagedKey: string,
    reason: string,
    actor: CurrentUser,
  ): Promise<never> {
    await this.auditService.record({
      // The same verb the document store and the clinic logo write: the
      // question afterwards is "which account keeps uploading forged files".
      action: 'DOCUMENT_UPLOAD_REJECTED',
      resource: TEMPLATE_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: {
        storageKey: stagedKey,
        declaredMimeType: DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE,
        reason,
      },
    });
    this.logger.warn(`Rejected template import ${stagedKey}: ${reason}`);
    throw new BadRequestException(reason);
  }

  /** The staged file is transient: gone after conversion, gone after refusal. */
  private async discardStagedObjectQuietly(stagedKey: string): Promise<void> {
    try {
      await this.objectStorageService.deleteObject({ key: stagedKey });
    } catch {
      this.logger.warn(
        buildSafeErrorLog('template_import_discard_failed', { storageKey: stagedKey }),
      );
    }
  }
}
