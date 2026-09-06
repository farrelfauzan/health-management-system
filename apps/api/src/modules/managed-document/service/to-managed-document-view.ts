import {
  ManagedDocumentApprovalSummaryView,
  ManagedDocumentDetailView,
  ManagedDocumentRecord,
  ManagedDocumentSubjectView,
  ManagedDocumentView,
} from '@hms/shared-types';

/** The detail's approval half (`P16-T29`): the type's default approver set. */
export type ManagedDocumentDetailExtras = {
  defaultApprovers: Array<{ id: string; email: string }>;
};

/**
 * The list row (FR-E5-01): metadata only, never the body.
 *
 * `approval` is passed in rather than read from the record because the open
 * round lives in another table and is fetched once for the whole page — a
 * mapper that went looking for it would be a query per row.
 */
export function toManagedDocumentView(
  record: ManagedDocumentRecord,
  approval: ManagedDocumentApprovalSummaryView | null = null,
): ManagedDocumentView {
  return {
    id: record.id,
    type: {
      id: record.type.id,
      code: record.type.code,
      name: record.type.name,
      behavior: record.type.behavior,
      contentMode: record.type.contentMode,
    },
    status: record.status,
    title: record.title,
    documentNumber: record.documentNumber,
    hasContentHtml: record.contentHtml !== null,
    storageKey: record.storageKey,
    storageMimeType: record.storageMimeType,
    storageSizeBytes: record.storageSizeBytes,
    patient: record.patient,
    doctor: record.doctor,
    subject: resolveSubject(record),
    draftedBy: record.draftedBy,
    approval,
    issuedAt: record.issuedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * The detail (FR-E5-05): the row, its drafted body, and the type's approval
 * policy. The policy travels with the document so the workspace knows in one
 * request whether this document has an approval half at all (US-E5-06).
 */
export function toManagedDocumentDetailView(
  record: ManagedDocumentRecord,
  approval: ManagedDocumentApprovalSummaryView | null = null,
  extras: ManagedDocumentDetailExtras = { defaultApprovers: [] },
): ManagedDocumentDetailView {
  return {
    ...toManagedDocumentView(record, approval),
    contentHtml: record.contentHtml,
    isApprovalRequired: record.type.isApprovalRequired,
    allowSelfApproval: record.type.allowSelfApproval,
    requiredApprovals: record.type.requiredApprovals,
    defaultApprovers: extras.defaultApprovers,
  };
}

function resolveSubject(record: ManagedDocumentRecord): ManagedDocumentSubjectView {
  if (record.subjectTemplateId !== null) {
    return { kind: 'TEMPLATE', templateId: record.subjectTemplateId };
  }
  if (record.subjectDocumentId !== null) {
    return { kind: 'STORE_DOCUMENT', documentId: record.subjectDocumentId };
  }
  if (record.subjectInvoiceId !== null) {
    return { kind: 'INVOICE', invoiceId: record.subjectInvoiceId };
  }
  return null;
}
