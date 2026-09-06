import {
  ManagedDocumentDetailView,
  ManagedDocumentRecord,
  ManagedDocumentSubjectView,
  ManagedDocumentView,
} from '@hms/shared-types';

/** The list row (FR-E5-01): metadata only, never the body. */
export function toManagedDocumentView(record: ManagedDocumentRecord): ManagedDocumentView {
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
    issuedAt: record.issuedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** The detail (FR-E5-05): the row plus its drafted body. */
export function toManagedDocumentDetailView(
  record: ManagedDocumentRecord,
): ManagedDocumentDetailView {
  return { ...toManagedDocumentView(record), contentHtml: record.contentHtml };
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
