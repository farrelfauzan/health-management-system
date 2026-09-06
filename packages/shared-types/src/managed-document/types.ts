import type { DocumentPurposeValue } from '#document-management/schemas';
import type {
  DocumentContentModeValue,
  DocumentTypeBehaviorValue,
  ManagedDocumentDateFieldValue,
  ManagedDocumentStatusValue,
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

/** A registry row as the repository projects it (`P16-T28`). */
export type ManagedDocumentRecord = {
  id: string;
  typeId: string;
  type: {
    id: string;
    code: string;
    name: string;
    behavior: DocumentTypeBehaviorValue;
    contentMode: DocumentContentModeValue;
    requiresPatient: boolean;
    requiresDoctor: boolean;
    isActive: boolean;
  };
  status: ManagedDocumentStatusValue;
  title: string;
  documentNumber: string | null;
  contentHtml: string | null;
  storageKey: string | null;
  storageMimeType: string | null;
  storageSizeBytes: number | null;
  patient: { id: string; fullName: string } | null;
  doctor: { id: string; fullName: string } | null;
  subjectTemplateId: string | null;
  subjectDocumentId: string | null;
  subjectInvoiceId: string | null;
  /**
   * The store document a row governs, when it does: its purpose and owner
   * are what the per-row access rule reads (FR-E5-04).
   */
  subjectDocument: { purpose: DocumentPurposeValue; ownerId: string | null } | null;
  draftedBy: { id: string; email: string };
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * What the registry knows about the caller before it queries (FR-E5-04).
 * Resolved once per request from the caller's roles; every predicate the
 * repository builds is a function of these five facts and nothing else.
 */
export type ManagedDocumentAccessContext = {
  userId: string;
  /** `invoice.read` in ANY scope — the gate on a PATIENT_BILL row. */
  canReadInvoices: boolean;
  /** `document-template.read` in ANY scope — the gate on a template row. */
  canReadTemplates: boolean;
  /** `document.read` in ANY scope — the gate on a clinic-corpus row. */
  canReadClinicCorpus: boolean;
  /** `patient-document.read` in ANY scope — never a registry source (§7.5.3), gated anyway. */
  canReadPatientDocuments: boolean;
};

/** The repository's list call: the filters plus the access context. */
export type ListManagedDocumentsParams = {
  access: ManagedDocumentAccessContext;
  typeId?: string;
  status?: ManagedDocumentStatusValue;
  draftedById?: string;
  approverId?: string;
  from?: Date;
  to?: Date;
  dateField: ManagedDocumentDateFieldValue;
  search?: string;
  page: number;
  limit: number;
};

export type ManagedDocumentPage = {
  items: ManagedDocumentRecord[];
  total: number;
};

/**
 * What the service hands the repository on create. `status`, the subject
 * links and `issuedAt` are here because the service — never a request —
 * decides them; a request-created row is always a DRAFT with no subject.
 */
export type CreateManagedDocumentRecordPayload = {
  typeId: string;
  status: ManagedDocumentStatusValue;
  title: string;
  documentNumber: string | null;
  contentHtml: string | null;
  storageKey: string | null;
  storageMimeType: string | null;
  storageSizeBytes: number | null;
  patientId: string | null;
  doctorId: string | null;
  subjectTemplateId: string | null;
  subjectDocumentId: string | null;
  subjectInvoiceId: string | null;
  draftedById: string;
  issuedAt: Date | null;
};

export type UpdateManagedDocumentRecordPayload = {
  id: string;
  title?: string;
  documentNumber?: string | null;
  contentHtml?: string | null;
  storageKey?: string | null;
  storageMimeType?: string | null;
  storageSizeBytes?: number | null;
  patientId?: string | null;
  doctorId?: string | null;
};

/** One audit row against a registry document, as the history reads it. */
export type ManagedDocumentHistoryEntryRecord = {
  id: string;
  action: string;
  actor: { id: string; email: string } | null;
  metadata: unknown;
  occurredAt: Date;
};
