import type { DocumentApprovalStatusValue } from '#document-approval/schemas';
import type {
  DocumentContentModeValue,
  DocumentTypeBehaviorValue,
} from '#managed-document/schemas';

/**
 * A person on a round, by the only human-readable identifier an account has.
 *
 * Declared here rather than imported from `#managed-document/contracts`,
 * which imports *this* file for the approval summary it puts on every
 * registry row. One direction only: approval knows nothing about the
 * registry's shape, and the registry knows about approval.
 */
export type DocumentApprovalActorView = {
  id: string;
  email: string;
};

/** One named approver on a round. */
export type DocumentApproverView = {
  id: string;
  email: string;
  /**
   * Whether this approver still counts. An account that was deactivated or
   * lost `document-approval.decide:any` since submission drops out of the
   * effective panel without being erased from the record of who was asked.
   */
  isEligible: boolean;
};

/** One decision, as the history thread shows it (FR-E5-05). */
export type DocumentApprovalDecisionView = {
  id: string;
  approver: DocumentApprovalActorView;
  isApproved: boolean;
  /** Always present on a rejection, always absent on an approval. */
  reason: string | null;
  decidedAt: string;
};

/**
 * One round of review (`P16-T29`). `isOverdue` is derived from `dueAt` and
 * the current time rather than stored, because a deadline changes nothing
 * about a round's state (FR-E5-28) — it is a flag the reader computes, not a
 * transition the row underwent.
 */
export type DocumentApprovalRoundView = {
  id: string;
  documentId: string;
  status: DocumentApprovalStatusValue;
  submittedBy: DocumentApprovalActorView;
  submittedAt: string;
  dueAt: string | null;
  isOverdue: boolean;
  resolvedAt: string | null;
  approvers: DocumentApproverView[];
  decisions: DocumentApprovalDecisionView[];
  /** How many approvals this round needs before the document is issued. */
  requiredApprovals: number;
  /** How many it has, so a multi-approval round renders "1 of 2" honestly. */
  approvalCount: number;
  /**
   * Set when every named approver has been deactivated or lost the decide
   * key: nobody can resolve this round, and the drafter is prompted to name
   * somebody else rather than waiting for a decision that cannot come.
   */
  hasNoEligibleApprover: boolean;
};

/** A queue row: the round plus just enough of its document to act on it. */
export type DocumentApprovalQueueItemView = {
  round: DocumentApprovalRoundView;
  document: {
    id: string;
    title: string;
    documentNumber: string | null;
    type: {
      id: string;
      code: string;
      name: string;
      behavior: DocumentTypeBehaviorValue;
      contentMode: DocumentContentModeValue;
    };
  };
};

export type DocumentApprovalQueueMeta = {
  page: number;
  limit: number;
  total: number;
};

export type DocumentApprovalQueueView = {
  items: DocumentApprovalQueueItemView[];
  meta: DocumentApprovalQueueMeta;
};

/**
 * The sidebar badge (FR-E5-27). Two numbers rather than one: `overdue` is a
 * subset of `pending`, and the badge shows the first while the registry
 * flags the second.
 */
export type DocumentApprovalPendingCountView = {
  pending: number;
  overdue: number;
};

/**
 * One line of a bulk approval's result (FR-E5-23).
 *
 * Every item reports for itself. A batch is not a transaction: an approver
 * clearing a backlog must not have twenty good decisions rolled back because
 * the twenty-first named a round somebody else had already decided, and they
 * must not be left guessing which one failed either.
 */
export type DocumentBulkApprovalItemView = {
  requestId: string;
  isApproved: boolean;
  /** The refusal, verbatim from the single-approve path that produced it. */
  error: { code: string; message: string } | null;
};

export type DocumentBulkApprovalView = {
  approvedCount: number;
  failedCount: number;
  items: DocumentBulkApprovalItemView[];
};
