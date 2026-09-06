import { Injectable } from '@nestjs/common';

import {
  DocumentTemplateVersionRecord,
  DocumentTemplateVersionSummary,
  DocumentTemplateView,
  DocumentTemplateWithLatestVersionRecord,
} from '@hms/shared-types';

/**
 * Record-to-contract projection for templates (P16-T05). Version summaries
 * deliberately omit `contentHtml` — the working copy is what the editor
 * loads, and version bytes belong to the render service.
 */
@Injectable()
export class DocumentTemplateMapper {
  /**
   * Everything on the view except the approval block, which is a read the
   * service owns (`P16-T32`): the mapper is a pure projection of one record
   * and must not acquire a second query to stay honest.
   */
  toView(
    record: DocumentTemplateWithLatestVersionRecord,
  ): Omit<DocumentTemplateView, 'approval'> {
    return {
      id: record.id,
      kind: record.kind,
      name: record.name,
      description: record.description,
      status: record.status,
      isDefault: record.isDefault,
      contentHtml: record.contentHtml,
      settings: record.settings,
      latestPublishedVersion:
        record.latestPublishedVersion === null
          ? undefined
          : this.toVersionSummary(record.latestPublishedVersion),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  toVersionSummary(record: DocumentTemplateVersionRecord): DocumentTemplateVersionSummary {
    return {
      id: record.id,
      versionNumber: record.versionNumber,
      publishedAt: record.publishedAt.toISOString(),
      publishedById: record.publishedById ?? undefined,
    };
  }
}
