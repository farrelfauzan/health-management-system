import type {
  DocumentContentModeValue,
  DocumentTypeBehaviorValue,
} from '#managed-document/schemas';

/** A type row as the repository projects it, with its default approvers. */
export type DocumentTypeRecord = {
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
  defaultApprovers: Array<{ id: string; email: string }>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * What the service hands the repository on create. `behavior` is present so
 * the repository states it explicitly rather than trusting a column default
 * — and it is the service, never a request, that fills it (FR-E5-32).
 */
export type CreateDocumentTypeRecordPayload = {
  code: string;
  name: string;
  description: string | null;
  behavior: DocumentTypeBehaviorValue;
  isApprovalRequired: boolean;
  allowSelfApproval: boolean;
  requiredApprovals: number;
  requiresPatient: boolean;
  requiresDoctor: boolean;
  contentMode: DocumentContentModeValue;
  isActive: boolean;
  sortOrder: number;
};

export type UpdateDocumentTypeRecordPayload = {
  id: string;
  code?: string;
  name?: string;
  description?: string | null;
  isApprovalRequired?: boolean;
  allowSelfApproval?: boolean;
  requiredApprovals?: number;
  requiresPatient?: boolean;
  requiresDoctor?: boolean;
  contentMode?: DocumentContentModeValue;
  isActive?: boolean;
  sortOrder?: number;
};

/** The three fields NFR-AUD-03 calls the approval policy. */
export type DocumentTypeApprovalPolicy = {
  isApprovalRequired: boolean;
  allowSelfApproval: boolean;
  requiredApprovals: number;
};

/** A candidate default approver as the repository sees them: any live staff account. */
export type DocumentTypeApproverCandidateRecord = {
  id: string;
  email: string;
  isPatient: boolean;
};
