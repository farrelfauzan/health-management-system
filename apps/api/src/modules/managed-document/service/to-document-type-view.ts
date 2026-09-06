import { DocumentTypeRecord, DocumentTypeView } from '@hms/shared-types';

/** The settings-screen row (`P16-T39`): everything on the type, read-only facts included. */
export function toDocumentTypeView(record: DocumentTypeRecord): DocumentTypeView {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    behavior: record.behavior,
    isSystem: record.isSystem,
    isApprovalRequired: record.isApprovalRequired,
    allowSelfApproval: record.allowSelfApproval,
    requiredApprovals: record.requiredApprovals,
    requiresPatient: record.requiresPatient,
    requiresDoctor: record.requiresDoctor,
    contentMode: record.contentMode,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    documentCount: record.documentCount,
    defaultApprovers: record.defaultApprovers.map((approver) => ({
      id: approver.id,
      email: approver.email,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
