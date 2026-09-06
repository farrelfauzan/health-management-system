import type {
  DocumentContentModeValue,
  DocumentTypeBehaviorValue,
  ManagedDocumentStatusValue,
} from '#managed-document/schemas';

/** One default approver as the settings screen shows them (FR-E5-38). */
export type DocumentTypeApproverView = {
  id: string;
  email: string;
};

/**
 * A document type as the API returns it (`P16-T39`). `behavior` and
 * `isSystem` are read-only facts about the row — the form shows them and
 * never sends them. `documentCount` is the usage count the settings screen
 * prunes by (FR-E5-39) and what the delete refusal names (FR-E5-36).
 */
export type DocumentTypeView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  behavior: DocumentTypeBehaviorValue;
  isSystem: boolean;
  isApprovalRequired: boolean;
  allowSelfApproval: boolean;
  requiredApprovals: number;
  requiresPatient: boolean;
  requiresDoctor: boolean;
  contentMode: DocumentContentModeValue;
  isActive: boolean;
  sortOrder: number;
  documentCount: number;
  defaultApprovers: DocumentTypeApproverView[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentTypeListView = {
  items: DocumentTypeView[];
};

export type DeletedDocumentTypeView = {
  id: string;
  deletedAt: string;
};

/** A party on a registry row, as the list shows them (FR-E5-03). */
export type ManagedDocumentPartyView = {
  id: string;
  fullName: string;
};

/** The drafter, by the only human-readable identifier an account has. */
export type ManagedDocumentDrafterView = {
  id: string;
  email: string;
};

/** The type a row files under, denormalised for the list (FR-E5-01). */
export type ManagedDocumentTypeSummaryView = {
  id: string;
  code: string;
  name: string;
  behavior: DocumentTypeBehaviorValue;
  contentMode: DocumentContentModeValue;
};

/**
 * What a row governs, when it governs something (§7.5.7). One of the three
 * ids is set, or none for a plain document. The kind is spelled out so a
 * client never has to infer it from which id is non-null.
 */
export type ManagedDocumentSubjectView =
  | { kind: 'TEMPLATE'; templateId: string }
  | { kind: 'STORE_DOCUMENT'; documentId: string }
  | { kind: 'INVOICE'; invoiceId: string }
  | null;

/**
 * One registry row (`P16-T28`, FR-E5-01). `contentHtml` is absent from the
 * list and present on the detail — a list is metadata, and the detail is
 * where content is read (FR-E5-05). Approval fields arrive with `P16-T29`.
 */
export type ManagedDocumentView = {
  id: string;
  type: ManagedDocumentTypeSummaryView;
  status: ManagedDocumentStatusValue;
  title: string;
  documentNumber: string | null;
  hasContentHtml: boolean;
  storageKey: string | null;
  storageMimeType: string | null;
  storageSizeBytes: number | null;
  patient: ManagedDocumentPartyView | null;
  doctor: ManagedDocumentPartyView | null;
  subject: ManagedDocumentSubjectView;
  draftedBy: ManagedDocumentDrafterView;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedDocumentDetailView = ManagedDocumentView & {
  contentHtml: string | null;
};

export type ManagedDocumentListMeta = {
  page: number;
  limit: number;
  /** Counted after the per-row access rule — never a row the caller cannot open (FR-E5-03). */
  total: number;
};

export type ManagedDocumentListView = {
  items: ManagedDocumentView[];
  meta: ManagedDocumentListMeta;
};

/**
 * One line of a document's history (FR-E5-05): the audit events recorded
 * against it, oldest first. `actor` is null for a system act.
 */
export type ManagedDocumentHistoryEntryView = {
  id: string;
  action: string;
  actor: ManagedDocumentDrafterView | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
};

export type ManagedDocumentHistoryView = {
  documentId: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  entries: ManagedDocumentHistoryEntryView[];
};
