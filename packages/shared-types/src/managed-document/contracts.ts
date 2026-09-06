import type {
  DocumentContentModeValue,
  DocumentTypeBehaviorValue,
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
