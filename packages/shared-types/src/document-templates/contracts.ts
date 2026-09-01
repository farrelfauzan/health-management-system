import type {
  DocumentTemplateKindValue,
  DocumentTemplateStatusValue,
  TemplateSettingsValue,
} from '#document-templates/schemas';

/**
 * One immutable published snapshot as the API returns it. `contentHtml` is
 * deliberately absent: the working copy is what the editor loads, and a
 * version's bytes matter to the render service, not to a list the admin
 * scrolls.
 */
export type DocumentTemplateVersionSummary = {
  id: string;
  versionNumber: number;
  publishedAt: string;
  publishedById?: string;
};

/**
 * The editable template with its publication state. `latestPublishedVersion`
 * is absent until the first publish — that absence is what the render service
 * treats as "fall back to the built-in layout".
 */
export type DocumentTemplateView = {
  id: string;
  kind: DocumentTemplateKindValue;
  name: string;
  description: string | null;
  status: DocumentTemplateStatusValue;
  isDefault: boolean;
  contentHtml: string;
  settings: TemplateSettingsValue;
  latestPublishedVersion?: DocumentTemplateVersionSummary;
  createdAt: string;
  updatedAt: string;
};

export type ArchivedDocumentTemplateView = {
  id: string;
  archivedAt: string;
};
