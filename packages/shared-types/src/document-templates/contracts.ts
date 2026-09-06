import type { TemplateVariableWarning } from '#billing/types';
import type {
  DocumentTemplateImportWarningCode,
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

/**
 * A preview render of the working copy against the built-in hostile fixture
 * (`P16-T12`, FR-E1-06). The URL is short-lived and points at a throwaway
 * object — nothing here is an invoice document, and nothing is persisted
 * against a patient. `warnings` carries every token the fixture could not
 * fill so the author sees a blank before a cashier does.
 */
export type DocumentTemplatePreviewView = {
  url: string;
  expiresAt: string;
  warnings: TemplateVariableWarning[];
};

/** One signed, browser-direct PUT for a `.docx` (`P16-T42`). */
export type DocumentTemplateImportUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type DocumentTemplateImportWarning = {
  code: DocumentTemplateImportWarningCode;
  message: string;
  detail?: string;
};

/**
 * The converted layout, ready for the editor and **not yet saved**: the
 * author reviews it, and the working copy changes only when they press
 * Save. `warnings` lists what did not survive the trip from Word.
 */
export type DocumentTemplateImportView = {
  contentHtml: string;
  warnings: DocumentTemplateImportWarning[];
};
