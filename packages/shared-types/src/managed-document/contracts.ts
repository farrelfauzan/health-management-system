import type { DocumentApprovalRoundView } from '#document-approval/contracts';
import type { DocumentApprovalStatusValue } from '#document-approval/schemas';
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
 * The open round on a registry row, flattened for the list (`P16-T29`,
 * FR-E5-27). Present only while a round is open — a resolved round belongs
 * to the history thread, not to a table cell.
 *
 * `isOverdue` is computed from `dueAt` at read time, never stored. A
 * deadline changes nothing about a round's state (FR-E5-28), so there is no
 * transition to persist: the row is still `PENDING` and still actionable,
 * and overdue is a fact about the clock rather than about the row.
 */
export type ManagedDocumentApprovalSummaryView = {
  roundId: string;
  status: DocumentApprovalStatusValue;
  dueAt: string | null;
  isOverdue: boolean;
  submittedAt: string;
  approverCount: number;
  approvalCount: number;
  requiredApprovals: number;
  /** Nobody left who may decide — the workspace prompts the drafter to re-name. */
  hasNoEligibleApprover: boolean;
};

/**
 * One registry row (`P16-T28`, FR-E5-01). `contentHtml` is absent from the
 * list and present on the detail — a list is metadata, and the detail is
 * where content is read (FR-E5-05).
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
  /** The open round, or null. See {@link ManagedDocumentApprovalSummaryView}. */
  approval: ManagedDocumentApprovalSummaryView | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedDocumentDetailView = ManagedDocumentView & {
  contentHtml: string | null;
  /**
   * Whether this document's *type* requires approval before it may be
   * issued (FR-E5-11/12). On the row rather than left to the client to
   * fetch from the type list, because the whole approval half of the
   * workspace — the approver picker, the banner, the badge — is absent when
   * this is false (US-E5-06), and a screen that had to wait for a second
   * request would flash it.
   */
  isApprovalRequired: boolean;
  allowSelfApproval: boolean;
  requiredApprovals: number;
  /** Pre-fills the drafter's approver picker (FR-E5-38). */
  defaultApprovers: ManagedDocumentDrafterView[];
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
  /**
   * Every round this document has been through, newest first, each with the
   * panel it named and the decisions recorded against it (`P16-T30`,
   * FR-E5-05). A rejected round keeps its reason here forever — that is the
   * half of the thread the drafter comes back for (US-E5-03).
   */
  rounds: DocumentApprovalRoundView[];
};

/** One signed, browser-direct PUT for a registry document's body (`P16-T36`). */
export type ManagedDocumentUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

/** A short-lived download of an uploaded body, served as an attachment (NFR-SEC-04). */
export type ManagedDocumentDownloadView = {
  url: string;
  expiresAt: string;
};
