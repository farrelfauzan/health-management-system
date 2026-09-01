import type {
  DocumentTemplateKindValue,
  DocumentTemplateStatusValue,
  TemplateSettingsValue,
} from '#document-templates/schemas';

/**
 * The working copy as the repository returns it. `settings` is already
 * validated — the repository parses the Json column through
 * `templateSettingsSchema` at the Prisma boundary so no raw Json escapes into
 * the domain, mirroring how Decimal columns surface as numbers.
 */
export type DocumentTemplateRecord = {
  id: string;
  kind: DocumentTemplateKindValue;
  name: string;
  description: string | null;
  status: DocumentTemplateStatusValue;
  isDefault: boolean;
  contentHtml: string;
  settings: TemplateSettingsValue;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One immutable published snapshot. There is no `updatedAt` because the row
 * is never updated — a rendered document points here, and the whole point of
 * the row is that nothing can rewrite what it pointed at.
 */
export type DocumentTemplateVersionRecord = {
  id: string;
  templateId: string;
  versionNumber: number;
  contentHtml: string;
  settings: TemplateSettingsValue;
  publishedById: string | null;
  publishedAt: Date;
};

export type DocumentTemplateWithLatestVersionRecord = DocumentTemplateRecord & {
  latestPublishedVersion: DocumentTemplateVersionRecord | null;
};

export type CreateDocumentTemplateRecordPayload = {
  kind: DocumentTemplateKindValue;
  name: string;
  description?: string;
  contentHtml: string;
  settings: TemplateSettingsValue;
  createdById: string;
};

export type UpdateDocumentTemplateRecordPayload = {
  id: string;
  name?: string;
  description?: string | null;
  contentHtml?: string;
  settings?: TemplateSettingsValue;
};

export type PublishDocumentTemplateRecordPayload = {
  templateId: string;
  publishedById: string;
};
