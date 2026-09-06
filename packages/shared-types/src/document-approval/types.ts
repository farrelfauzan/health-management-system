import type { DocumentApprovalStatusValue } from '#document-approval/schemas';
import type {
  DocumentContentModeValue,
  DocumentTypeBehaviorValue,
} from '#managed-document/schemas';

/**
 * The content and panel a submission froze (FR-E5-16). Stored as JSON on the
 * round because it is a snapshot of a moment, not a live projection: the
 * document may be edited afterwards — that voids the round — and the
 * approver rows may be deleted with their accounts, and neither may change
 * what an approver was actually looking at.
 */
export type DocumentApprovalFrozenPayload = {
  title: string;
  documentNumber: string | null;
  contentHtml: string | null;
  storageKey: string | null;
  storageMimeType: string | null;
  storageSizeBytes: number | null;
  patientId: string | null;
  doctorId: string | null;
  approverIds: string[];
  frozenAt: string;
};

/** One approver row as the repository projects it. */
export type DocumentApprovalApproverRecord = {
  approverId: string;
  email: string;
  isEligible: boolean;
};

export type DocumentApprovalDecisionRecord = {
  id: string;
  approverId: string;
  approverEmail: string;
  isApproved: boolean;
  reason: string | null;
  decidedAt: Date;
};

/** One round as the repository projects it, with its panel and decisions. */
export type DocumentApprovalRequestRecord = {
  id: string;
  documentId: string;
  status: DocumentApprovalStatusValue;
  frozenPayload: DocumentApprovalFrozenPayload;
  submittedBy: { id: string; email: string };
  submittedAt: Date;
  dueAt: Date | null;
  resolvedAt: Date | null;
  dueSoonNotifiedAt: Date | null;
  overdueNotifiedAt: Date | null;
  approvers: DocumentApprovalApproverRecord[];
  decisions: DocumentApprovalDecisionRecord[];
};

/** A queue row: the round joined to the little of its document a queue shows. */
export type DocumentApprovalQueueRecord = {
  round: DocumentApprovalRequestRecord;
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
      requiredApprovals: number;
    };
  };
};

export type DocumentApprovalQueuePage = {
  items: DocumentApprovalQueueRecord[];
  total: number;
};

export type ListDocumentApprovalsParams = {
  /** Set when the queue is scoped to one person's panel memberships. */
  approverId?: string;
  status?: DocumentApprovalStatusValue;
  /** Pending rounds whose deadline has passed, as of `now`. */
  overdueOnly?: boolean;
  now: Date;
  page: number;
  limit: number;
};

/** What the service hands the repository to open a round. */
export type CreateDocumentApprovalRequestPayload = {
  documentId: string;
  frozenPayload: DocumentApprovalFrozenPayload;
  submittedById: string;
  dueAt: Date | null;
  approverIds: string[];
};

/**
 * A candidate approver as the eligibility check sees them. `isPatient` and
 * `canDecide` are separate because they refuse for different reasons: a
 * patient may never be named at all (FR-E5-09), while a staff account
 * without the decide key may be named and simply cannot act until a role
 * grants it.
 */
export type DocumentApproverCandidateRecord = {
  id: string;
  email: string;
  isPatient: boolean;
  canDecide: boolean;
};

/** The two counts behind the sidebar badge (FR-E5-27). */
export type DocumentApprovalPendingCounts = {
  pending: number;
  overdue: number;
};

/** One round the deadline sweep has to say something about (FR-E5-28). */
export type DocumentApprovalDeadlineRecord = {
  requestId: string;
  documentId: string;
  documentTitle: string;
  documentTypeName: string;
  dueAt: Date;
  approverIds: string[];
  submittedById: string;
};

/** Which of the two deadline notices a sweep is claiming for a round. */
export type DocumentApprovalDeadlineKind = 'DUE_SOON' | 'OVERDUE';
