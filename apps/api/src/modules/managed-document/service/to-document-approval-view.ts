import {
  DocumentApprovalRequestRecord,
  DocumentApprovalRoundView,
  ManagedDocumentApprovalSummaryView,
} from '@hms/shared-types';

/**
 * One round, fully (`P16-T29`): the panel that was named, who has answered
 * and what they said.
 *
 * `isOverdue` and `hasNoEligibleApprover` are both computed here rather than
 * read off the row, for the same reason: neither is a state the round
 * entered. A deadline passing writes nothing (FR-E5-28), and an approver
 * being deactivated writes nothing to the round either — both are facts
 * about the world *now*, evaluated against a record that has not changed.
 */
export function toDocumentApprovalRoundView(
  record: DocumentApprovalRequestRecord,
  requiredApprovals: number,
  now: Date,
): DocumentApprovalRoundView {
  const approvalCount = record.decisions.filter((decision) => decision.isApproved).length;
  return {
    id: record.id,
    documentId: record.documentId,
    status: record.status,
    submittedBy: record.submittedBy,
    submittedAt: record.submittedAt.toISOString(),
    dueAt: record.dueAt?.toISOString() ?? null,
    isOverdue: isRoundOverdue(record, now),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    approvers: record.approvers.map((approver) => ({
      id: approver.approverId,
      email: approver.email,
      isEligible: approver.isEligible,
    })),
    decisions: record.decisions.map((decision) => ({
      id: decision.id,
      approver: { id: decision.approverId, email: decision.approverEmail },
      isApproved: decision.isApproved,
      reason: decision.reason,
      decidedAt: decision.decidedAt.toISOString(),
    })),
    requiredApprovals,
    approvalCount,
    hasNoEligibleApprover: hasNoEligibleApprover(record),
  };
}

/** The same round flattened onto a registry row — counts, not names (FR-E5-27). */
export function toManagedDocumentApprovalSummaryView(
  record: DocumentApprovalRequestRecord,
  requiredApprovals: number,
  now: Date,
): ManagedDocumentApprovalSummaryView {
  return {
    roundId: record.id,
    status: record.status,
    dueAt: record.dueAt?.toISOString() ?? null,
    isOverdue: isRoundOverdue(record, now),
    submittedAt: record.submittedAt.toISOString(),
    approverCount: record.approvers.length,
    approvalCount: record.decisions.filter((decision) => decision.isApproved).length,
    requiredApprovals,
    hasNoEligibleApprover: hasNoEligibleApprover(record),
  };
}

/**
 * Only an *open* round can be overdue. A round that was approved after its
 * deadline was late, not overdue — nothing is waiting on it, and flagging it
 * forever would put a permanent red mark on a document that is finished.
 */
function isRoundOverdue(record: DocumentApprovalRequestRecord, now: Date): boolean {
  return (
    record.status === 'PENDING' && record.dueAt !== null && record.dueAt.getTime() < now.getTime()
  );
}

/**
 * Every named approver has been deactivated or has lost the decide key, so
 * the round cannot resolve however long anyone waits. A resolved round is
 * never flagged: it does not matter who *can* decide once somebody has.
 */
function hasNoEligibleApprover(record: DocumentApprovalRequestRecord): boolean {
  return (
    record.status === 'PENDING' &&
    record.approvers.length > 0 &&
    record.approvers.every((approver) => !approver.isEligible)
  );
}
