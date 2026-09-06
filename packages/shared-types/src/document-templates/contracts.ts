import type { TemplateVariableWarning } from '#billing/types';
import type { ManagedDocumentApprovalSummaryView } from '#managed-document/contracts';
import type { ManagedDocumentStatusValue } from '#managed-document/schemas';
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
  /** See {@link DocumentTemplateApprovalView}. Absent from list rows only when the type row is missing. */
  approval: DocumentTemplateApprovalView;
  createdAt: string;
  updatedAt: string;
};

/**
 * The approval state of a template's publish step (`P16-T32`).
 *
 * Present on every template view and **all-off by default**: a clinic that
 * has not switched approval on for `INVOICE_TEMPLATE` gets
 * `isApprovalRequired: false` and no round, and the editor draws no approver
 * field, banner or badge (US-E5-06). `managedDocumentId` is the registry row
 * the submit and withdraw routes act on — the editor never invents an id, it
 * uses this one.
 */
export type DocumentTemplateApprovalView = {
  isApprovalRequired: boolean;
  managedDocumentId: string | null;
  status: ManagedDocumentStatusValue | null;
  pendingRound: ManagedDocumentApprovalSummaryView | null;
};

/** One block of a template diff (`P16-T32`, FR-E5-22). */
export type DocumentTemplateDiffSegment = {
  kind: 'UNCHANGED' | 'ADDED' | 'REMOVED';
  text: string;
};

/**
 * What an approver is shown before deciding on a template (`P16-T32`).
 *
 * `preview` renders the **frozen submission** against the hostile fixture —
 * not the working copy, which may have moved on since the round opened
 * (FR-E5-21). `diff` is the same frozen layout against the version invoices
 * are currently rendered from, so "what changed" is read rather than
 * reconstructed (FR-E5-22).
 */
export type DocumentTemplateApprovalPreviewView = {
  preview: DocumentTemplatePreviewView;
  /** Null when nothing has been published yet — the whole submission is new. */
  baseVersionNumber: number | null;
  diff: DocumentTemplateDiffSegment[];
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
