import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import {
  ArchivedDocumentTemplateView,
  CreateDocumentTemplateInput,
  DocumentTemplateKindValue,
  DocumentTemplateVersionRecord,
  DocumentTemplateView,
  DocumentTemplateWithLatestVersionRecord,
  ListDocumentTemplatesQueryInput,
  UpdateDocumentTemplateInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import { DocumentTemplateMapper } from './document-template.mapper';
import { sanitiseTemplateHtml } from './sanitise-template-html';

const TEMPLATE_AUDIT_RESOURCE = 'document-template';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/**
 * Business rules for document templates (P16-T05).
 *
 * Every path that stores `contentHtml` — create and update — runs it through
 * the server-side sanitiser first (NFR-SEC-01); the client's own sanitisation
 * is a convenience, never the control. Publish copies the already-sanitised
 * working copy into an immutable version row, so no unsanitised byte has a
 * route into a version either.
 */
@Injectable()
export class DocumentTemplateService {
  constructor(
    private readonly documentTemplateRepository: DocumentTemplateRepository,
    private readonly documentTemplateMapper: DocumentTemplateMapper,
    private readonly auditService: AuditService,
  ) {}

  async listTemplates(query: ListDocumentTemplatesQueryInput): Promise<DocumentTemplateView[]> {
    const records = await this.documentTemplateRepository.listByKind(query.kind);
    return records.map((record) => this.documentTemplateMapper.toView(record));
  }

  async createTemplate(
    input: CreateDocumentTemplateInput,
    actor: CurrentUser,
  ): Promise<DocumentTemplateView> {
    const record = await this.documentTemplateRepository.createTemplate({
      kind: input.kind,
      name: input.name,
      description: input.description,
      contentHtml: sanitiseTemplateHtml(input.contentHtml),
      settings: input.settings,
      createdById: actor.sub,
    });
    await this.auditService.record({
      action: 'CREATE',
      resource: TEMPLATE_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      metadata: { kind: record.kind },
    });
    return this.documentTemplateMapper.toView({ ...record, latestPublishedVersion: null });
  }

  async updateTemplate(
    id: string,
    input: UpdateDocumentTemplateInput,
    actor: CurrentUser,
  ): Promise<DocumentTemplateView> {
    await this.findTemplateOrThrow(id);
    const record = await this.documentTemplateRepository.updateTemplate({
      id,
      name: input.name,
      description: input.description,
      contentHtml: input.contentHtml === undefined ? undefined : sanitiseTemplateHtml(input.contentHtml),
      settings: input.settings,
    });
    await this.auditService.record({
      action: 'UPDATE',
      resource: TEMPLATE_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      // Field names, never values: the HTML body is layout, but which fields
      // an administrator touched is what an investigator asks first.
      metadata: {
        changedFields: Object.keys(input)
          .filter((key) => input[key as keyof UpdateDocumentTemplateInput] !== undefined)
          .sort(),
      },
    });
    return this.documentTemplateMapper.toView(record);
  }

  /**
   * Cuts an immutable version from the working copy. A blank layout is
   * refused here rather than at create — a template legitimately starts
   * empty in the editor, but a published version is what real invoices
   * render from.
   */
  async publishTemplate(id: string, actor: CurrentUser): Promise<DocumentTemplateView> {
    const existing = await this.findTemplateOrThrow(id);
    if (existing.contentHtml.trim() === '') {
      throw new ConflictException('A template with no content cannot be published');
    }
    try {
      const published = await this.documentTemplateRepository.publishTemplate({
        templateId: id,
        publishedById: actor.sub,
      });
      await this.auditService.record({
        action: 'UPDATE',
        resource: TEMPLATE_AUDIT_RESOURCE,
        resourceId: id,
        actorUserId: actor.sub,
        metadata: { event: 'TEMPLATE_PUBLISHED', versionNumber: published.version.versionNumber },
      });
      return this.documentTemplateMapper.toView({
        ...published.template,
        latestPublishedVersion: published.version,
      });
    } catch (err: unknown) {
      if (this.isUniqueConstraintError(err)) {
        throw new ConflictException('The template was published concurrently — retry');
      }
      throw err;
    }
  }

  /**
   * A template with no published version cannot become the default: the
   * render service resolves "the default template's latest published
   * version", and a default that resolves to nothing would silently push
   * every invoice onto the built-in fallback.
   */
  async setDefaultTemplate(id: string, actor: CurrentUser): Promise<DocumentTemplateView> {
    const existing = await this.findTemplateOrThrow(id);
    if (existing.latestPublishedVersion === null) {
      throw new ConflictException('A template with no published version cannot be the default');
    }
    try {
      const record = await this.documentTemplateRepository.setDefaultTemplate(id, existing.kind);
      await this.auditService.record({
        action: 'UPDATE',
        resource: TEMPLATE_AUDIT_RESOURCE,
        resourceId: id,
        actorUserId: actor.sub,
        metadata: { event: 'TEMPLATE_SET_DEFAULT', kind: existing.kind },
      });
      return this.documentTemplateMapper.toView(record);
    } catch (err: unknown) {
      if (this.isUniqueConstraintError(err)) {
        throw new ConflictException('The default template changed concurrently — retry');
      }
      throw err;
    }
  }

  /**
   * Soft delete. The default is refused rather than silently re-pointed:
   * deleting the layout every invoice renders with is a decision, and the
   * decision is picking the successor first.
   */
  async archiveTemplate(id: string, actor: CurrentUser): Promise<ArchivedDocumentTemplateView> {
    const existing = await this.findTemplateOrThrow(id);
    if (existing.isDefault) {
      throw new ConflictException(
        'The default template cannot be deleted — set another default first',
      );
    }
    const archivedAt = new Date();
    await this.documentTemplateRepository.archiveTemplate(id, archivedAt);
    await this.auditService.record({
      action: 'DELETE',
      resource: TEMPLATE_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      metadata: { kind: existing.kind },
    });
    return { id, archivedAt: archivedAt.toISOString() };
  }

  /**
   * The version a renderer should use for a new document of this kind: the
   * default template's latest published version, or `null` when no template
   * has been published — the render service's cue to fall back to the
   * built-in layout (`P16-T06`).
   */
  async findDefaultPublishedVersion(
    kind: DocumentTemplateKindValue,
  ): Promise<DocumentTemplateVersionRecord | null> {
    return this.documentTemplateRepository.findLatestPublishedVersionByKind(kind);
  }

  private async findTemplateOrThrow(id: string): Promise<DocumentTemplateWithLatestVersionRecord> {
    const record = await this.documentTemplateRepository.findById(id);
    if (record === null) {
      throw new NotFoundException('Document template not found');
    }
    return record;
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
