import type { DocumentTemplateImportWarning } from '#document-templates/contracts';
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
  /** The approval decision that released this version, when one did (P16-T32). */
  approvalDecisionId: string | null;
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

/** What the DOCX converter hands back before sanitising (`P16-T42`). */
export type ConvertedDocxTemplate = {
  html: string;
  warnings: DocumentTemplateImportWarning[];
};

/** The magic-byte verdict on a staged Word file (`P16-T42`). */
export type DocxContentValidationResult =
  | { readonly isAccepted: true }
  | { readonly isAccepted: false; readonly reason: string };

/**
 * Everything a printed clinical request needs, gathered by the module that
 * owns the record (`P18-T12`).
 *
 * The renderer takes this rather than a lab order or a prescription: it must
 * not know what either of those is, or it becomes a second place where the
 * rules about them live. The caller formats; this is already print-ready.
 */
export type ClinicalRequestRenderContext = {
  kind: 'LAB_REQUEST' | 'PRESCRIPTION';
  /** The clinical record being printed — a lab order id, or a prescription id. */
  subjectId: string;
  patientId: string;
  encounterId: string | null;
  /** Filed as the document's title, and shown in the patient's file list. */
  title: string;
  /** Scalar tokens, keyed by the registry token they fill. */
  values: Readonly<Record<string, string>>;
  /** The repeating block: requested tests, or prescribed medications. */
  lines: readonly Readonly<Record<string, string>>[];
};
