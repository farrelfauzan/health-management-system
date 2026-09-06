import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CreateManagedDocumentInput,
  CreateManagedDocumentUploadUrlInput,
  DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE,
  DOCUMENT_UPLOAD_MIME_TYPES,
  DocumentUploadMimeTypeValue,
  ExportManagedDocumentsQueryInput,
  ListManagedDocumentsQueryInput,
  MANAGED_DOCUMENT_CONTENT_CONFLICT_ERROR_CODE,
  MANAGED_DOCUMENT_EXPORT_MAX_ROWS,
  MANAGED_DOCUMENT_NOT_EDITABLE_ERROR_CODE,
  MANAGED_DOCUMENT_TYPE_RULE_ERROR_CODE,
  ManagedDocumentAccessContext,
  ManagedDocumentDetailView,
  ManagedDocumentDownloadView,
  ManagedDocumentHistoryView,
  ManagedDocumentListView,
  ManagedDocumentRecord,
  ManagedDocumentShape,
  ManagedDocumentStatusValue,
  ManagedDocumentTypeRules,
  ManagedDocumentUploadUrlView,
  UpdateManagedDocumentInput,
  validateManagedDocumentAgainstType,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { sanitiseRichTextHtml } from '../../../common/html/sanitise-rich-text-html';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { buildDocumentDownloadDisposition } from '../../document-management/service/build-document-download-disposition';
import { UploadedDocumentGuardService } from '../../document-management/service/uploaded-document-guard.service';
import { ManagedDocumentRepository } from '../repository/managed-document.repository';
import { buildManagedDocumentCsv } from './build-managed-document-csv';
import { DocumentApprovalService } from './document-approval.service';
import { DocumentTypeService } from './document-type.service';
import { isManagedDocumentStorageKey } from './is-managed-document-storage-key';
import { ManagedDocumentAccessService } from './managed-document-access.service';
import { MANAGED_DOCUMENT_STORAGE_KEY_PREFIX } from './managed-document-storage-key-prefix';
import {
  toDocumentApprovalRoundView,
  toManagedDocumentApprovalSummaryView,
} from './to-document-approval-view';
import { toManagedDocumentDetailView, toManagedDocumentView } from './to-managed-document-view';

const MANAGED_DOCUMENT_AUDIT_RESOURCE = 'managed-document';

/**
 * The states a drafter may edit in (§7.5.10).
 *
 * `PENDING_APPROVAL` is here rather than refused because FR-E5-15 says what
 * an edit under review *does* — it voids the round — and refusing the edit
 * instead would leave the drafter's only route "withdraw, edit, resubmit",
 * which is the same three writes with a worse name. `ISSUED` and `ARCHIVED`
 * are absent: an issued document is a record of what the clinic handed out.
 */
const EDITABLE_STATUSES: readonly ManagedDocumentStatusValue[] = ['DRAFT', 'PENDING_APPROVAL'];

export const MANAGED_DOCUMENT_NOT_DOWNLOADABLE_ERROR_CODE = 'MANAGED_DOCUMENT_NOT_DOWNLOADABLE';

type StoredContent = { storageKey: string; storageMimeType: string; storageSizeBytes: number };

export type ManagedDocumentExport = { fileName: string; csv: string };

/**
 * The documents registry (`P16-T28`, FR-E5-01…05, FR-E5-07) and the shape
 * rules a type imposes on its documents (`P16-T36`, FR-E5-35).
 *
 * Four rules are load-bearing:
 *
 *   * **Every read goes through the per-row source rule** (FR-E5-04). The
 *     access context is resolved once per request and handed to the
 *     repository, which folds it into the query; a row outside the caller's
 *     reach is absent from the list, absent from the count, and a 404 on
 *     the detail — never a 403 that confirms it exists.
 *   * **The type row decides the document's shape.** `requiresPatient` /
 *     `requiresDoctor` and `contentMode` are enforced on every create and
 *     edit through {@link validateManagedDocumentAgainstType} — the same
 *     function the web form builds itself from — with a 422 naming each
 *     broken rule and its field.
 *   * **Drafted content is sanitised on every write** (NFR-SEC-01), with
 *     the same allowlist sanitiser the template editor uses. An uploaded
 *     body passes the store's confirm-time content gate before a row may
 *     point at it. A document is drafted or uploaded, never both.
 *   * **The status and the subject links are the service's.** A request
 *     creates a DRAFT with no subject; `PATIENT_BILL` rows and the links
 *     that make a row answer to another module's rule are written by that
 *     module, never from a body.
 */
@Injectable()
export class ManagedDocumentService {
  constructor(
    private readonly managedDocumentRepository: ManagedDocumentRepository,
    private readonly accessService: ManagedDocumentAccessService,
    private readonly documentTypeService: DocumentTypeService,
    private readonly approvalService: DocumentApprovalService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly uploadedDocumentGuardService: UploadedDocumentGuardService,
    private readonly auditService: AuditService,
  ) {}

  async listDocuments(
    query: ListManagedDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentListView> {
    const access = await this.accessService.resolveContext(actor);
    const page = await this.managedDocumentRepository.listDocuments({
      access,
      ...(await this.buildFilterParams(query)),
      page: query.page,
      limit: query.limit,
    });
    // One query for the whole page's open rounds (`P16-T29`), not one per
    // row: the overdue flag is on every row of the registry (FR-E5-27), so a
    // per-row lookup would be a query per document on every list call.
    const rounds = await this.approvalService.findOpenRounds(page.items.map((item) => item.id));
    const now = new Date();
    return {
      items: page.items.map((item) => {
        const round = rounds.get(item.id);
        return toManagedDocumentView(
          item,
          round === undefined
            ? null
            : toManagedDocumentApprovalSummaryView(round, item.type.requiredApprovals, now),
        );
      }),
      meta: { page: query.page, limit: query.limit, total: page.total },
    };
  }

  async getDocument(id: string, actor: CurrentUser): Promise<ManagedDocumentDetailView> {
    const access = await this.accessService.resolveContext(actor);
    const record = await this.findVisibleOrThrow(id, access);
    const round = await this.approvalService.findOpenRound(id);
    const type = await this.documentTypeService.findTypeOrThrow(record.typeId);
    return toManagedDocumentDetailView(
      record,
      round === null
        ? null
        : toManagedDocumentApprovalSummaryView(round, record.type.requiredApprovals, new Date()),
      { defaultApprovers: type.defaultApprovers },
    );
  }

  /**
   * Signs a browser-direct upload of a document's body (`P16-T36`). Nothing
   * is persisted: the key is minted here and proven again at record time,
   * and an object nobody records is a staged file a sweep can remove.
   */
  async createUploadUrl(
    input: CreateManagedDocumentUploadUrlInput,
  ): Promise<ManagedDocumentUploadUrlView> {
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: MANAGED_DOCUMENT_STORAGE_KEY_PREFIX,
      fileExtension: DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE[input.mimeType],
    });
    const signed = await this.objectStorageService.getSignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      contentLengthBytes: input.sizeBytes,
    });
    return {
      url: signed.url,
      storageKey: signed.key,
      expiresAt: signed.expiresAt,
      requiredHeaders: signed.requiredHeaders,
    };
  }

  async createDocument(
    input: CreateManagedDocumentInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentDetailView> {
    const type = await this.documentTypeService.findActiveTypeOrThrow(input.typeId);
    assertMatchesType(type, {
      patientId: input.patientId ?? null,
      doctorId: input.doctorId ?? null,
      hasContentHtml: input.contentHtml !== undefined || input.storageKey === undefined,
      hasStorageKey: input.storageKey !== undefined,
    });
    await this.assertPartiesExist(input.patientId ?? null, input.doctorId ?? null);
    const stored = await this.resolveStoredContent(input.storageKey ?? null, actor);
    const record = await this.managedDocumentRepository.createDocument({
      typeId: type.id,
      status: 'DRAFT',
      title: input.title,
      documentNumber: input.documentNumber ?? null,
      contentHtml: resolveDraftedContent(input.contentHtml, stored),
      storageKey: stored?.storageKey ?? null,
      storageMimeType: stored?.storageMimeType ?? null,
      storageSizeBytes: stored?.storageSizeBytes ?? null,
      patientId: input.patientId ?? null,
      doctorId: input.doctorId ?? null,
      subjectTemplateId: null,
      subjectDocumentId: null,
      subjectInvoiceId: null,
      draftedById: actor.sub,
      issuedAt: null,
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      resource: MANAGED_DOCUMENT_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      patientId: record.patient?.id ?? null,
      metadata: { typeCode: record.type.code, contentKind: describeContent(record) },
    });
    return toManagedDocumentDetailView(record);
  }

  async updateDocument(
    id: string,
    input: UpdateManagedDocumentInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentDetailView> {
    const access = await this.accessService.resolveContext(actor);
    const existing = await this.findVisibleOrThrow(id, access);
    assertEditable(existing);
    assertContentStaysExclusive(existing, input);
    assertMatchesType(existing.type, resolveNextShape(existing, input));
    await this.assertPartiesExist(input.patientId ?? null, input.doctorId ?? null);
    const stored = await this.resolveStoredContent(input.storageKey ?? null, actor);
    // FR-E5-15, and deliberately after every check above: an edit while a
    // round is open voids the round, and an edit that was going to be
    // refused anyway must not void anything. Once the write is certain to
    // happen, the approvers were reviewing something that no longer exists,
    // so the round is superseded, the document returns to DRAFT and they are
    // told.
    await this.approvalService.supersedeOpenRounds(existing, actor);
    const record = await this.managedDocumentRepository.updateDocument({
      id,
      title: input.title,
      documentNumber: input.documentNumber,
      contentHtml:
        input.contentHtml === undefined
          ? undefined
          : input.contentHtml === null
            ? null
            : sanitiseRichTextHtml(input.contentHtml),
      storageKey: input.storageKey,
      storageMimeType:
        input.storageKey === undefined ? undefined : (stored?.storageMimeType ?? null),
      storageSizeBytes:
        input.storageKey === undefined ? undefined : (stored?.storageSizeBytes ?? null),
      patientId: input.patientId,
      doctorId: input.doctorId,
    });
    await this.auditService.record({
      action: AuditAction.UPDATE,
      resource: MANAGED_DOCUMENT_AUDIT_RESOURCE,
      resourceId: id,
      actorUserId: actor.sub,
      patientId: record.patient?.id ?? null,
      // Field names, never values: the body is the document, but which fields
      // a drafter touched is what an investigator asks first.
      metadata: { changedFields: listChangedFields(input) },
    });
    return toManagedDocumentDetailView(record);
  }

  /**
   * A signed download of an uploaded body (`P16-T36`, NFR-SEC-04): served
   * as an attachment under the validated stored type, never rendered in the
   * app origin. Audited before the URL is issued; no record, no URL.
   */
  async getDownloadUrl(id: string, actor: CurrentUser): Promise<ManagedDocumentDownloadView> {
    const access = await this.accessService.resolveContext(actor);
    const record = await this.findVisibleOrThrow(id, access);
    if (record.storageKey === null || record.storageMimeType === null) {
      throw new ConflictException({
        message: 'This document was drafted in the editor and has no file to download',
        code: MANAGED_DOCUMENT_NOT_DOWNLOADABLE_ERROR_CODE,
      });
    }
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: record.storageKey,
      responseContentDisposition: buildDocumentDownloadDisposition({
        title: record.title,
        mimeType: record.storageMimeType,
      }),
      responseContentType: record.storageMimeType,
    });
    await this.auditService.recordOrThrow({
      action: AuditAction.READ,
      resource: MANAGED_DOCUMENT_AUDIT_RESOURCE,
      resourceId: record.id,
      actorUserId: actor.sub,
      patientId: record.patient?.id ?? null,
      metadata: { event: 'DOWNLOAD', typeCode: record.type.code, mimeType: record.storageMimeType },
    });
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  async getHistory(id: string, actor: CurrentUser): Promise<ManagedDocumentHistoryView> {
    const access = await this.accessService.resolveContext(actor);
    const record = await this.findVisibleOrThrow(id, access);
    const entries = await this.managedDocumentRepository.listHistory(id);
    const rounds = await this.approvalService.listRounds(id);
    const now = new Date();
    return {
      documentId: record.id,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      issuedAt: record.issuedAt?.toISOString() ?? null,
      entries: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actor: entry.actor,
        metadata: isRecord(entry.metadata) ? entry.metadata : null,
        occurredAt: entry.occurredAt.toISOString(),
      })),
      rounds: rounds.map((round) =>
        toDocumentApprovalRoundView(round, record.type.requiredApprovals, now),
      ),
    };
  }

  /**
   * The filtered list as CSV (FR-E5-07) — metadata only — audited as an
   * explicit export (NFR-PRIV-01): a bulk read of who signed what with the
   * clinic is a fact worth finding later, whoever ran it.
   */
  async exportDocuments(
    query: ExportManagedDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentExport> {
    const access = await this.accessService.resolveContext(actor);
    const filters = await this.buildFilterParams(query);
    const records = await this.managedDocumentRepository.listDocumentsForExport(
      { access, ...filters },
      MANAGED_DOCUMENT_EXPORT_MAX_ROWS,
    );
    await this.auditService.recordOrThrow({
      action: AuditAction.EXPORT,
      resource: MANAGED_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { rowCount: records.length, filters: { ...query } },
    });
    return { fileName: buildExportFileName(), csv: buildManagedDocumentCsv(records) };
  }

  /**
   * The list and export filters, with the approver one resolved to document
   * ids (`P16-T29`). It is the only filter that cannot be a predicate on
   * `managed_documents` — "awaiting this person" is a fact about an open
   * round — so it is answered first and handed down as ids.
   */
  private async buildFilterParams(
    query: ExportManagedDocumentsQueryInput,
  ): Promise<Omit<Parameters<ManagedDocumentRepository['listDocuments']>[0], 'access' | 'page' | 'limit'>> {
    return {
      typeId: query.typeId,
      status: query.status,
      draftedById: query.draftedBy,
      awaitingApprovalDocumentIds:
        query.approver === undefined
          ? undefined
          : await this.approvalService.findDocumentIdsAwaitingApprover(query.approver),
      from: query.from === undefined ? undefined : new Date(`${query.from}T00:00:00.000Z`),
      to: query.to === undefined ? undefined : new Date(`${query.to}T23:59:59.999Z`),
      dateField: query.dateField,
      search: query.q,
    };
  }

  private async findVisibleOrThrow(
    id: string,
    access: ManagedDocumentAccessContext,
  ): Promise<ManagedDocumentRecord> {
    const record = await this.managedDocumentRepository.findVisibleById(id, access);
    if (record === null) {
      throw new NotFoundException('Document not found');
    }
    return record;
  }

  private async assertPartiesExist(
    patientId: string | null,
    doctorId: string | null,
  ): Promise<void> {
    if (
      patientId !== null &&
      (await this.managedDocumentRepository.findPatientById(patientId)) === null
    ) {
      throw new NotFoundException('Patient not found');
    }
    if (
      doctorId !== null &&
      (await this.managedDocumentRepository.findDoctorById(doctorId)) === null
    ) {
      throw new NotFoundException('Doctor not found');
    }
  }

  /**
   * An uploaded body is recorded from the stored object, never from the
   * request: the key must be one this module minted, the bytes must agree
   * with the type they were signed under (SJ-21 — a forged file is deleted
   * and audited), and the type and size are read back from the bucket.
   */
  private async resolveStoredContent(
    storageKey: string | null,
    actor: CurrentUser,
  ): Promise<StoredContent | null> {
    if (storageKey === null) {
      return null;
    }
    if (!isManagedDocumentStorageKey(storageKey)) {
      throw new BadRequestException('Storage key was not issued for a registry document upload');
    }
    const stored = await this.objectStorageService.headObject({ key: storageKey });
    const mimeType = resolveStoredMimeType(stored.contentType);
    const guarded = await this.uploadedDocumentGuardService.guardUploadedDocument({
      storageKey,
      declaredMimeType: mimeType,
      actorUserId: actor.sub,
    });
    return { storageKey, storageMimeType: mimeType, storageSizeBytes: guarded.sizeBytes };
  }
}

/**
 * A drafted document is never NULL-bodied: a blank draft is `''`, so the
 * CHECK reading "drafted or uploaded" still sees a drafted row. Sanitised
 * on every write (NFR-SEC-01).
 */
function resolveDraftedContent(
  contentHtml: string | undefined,
  stored: StoredContent | null,
): string | null {
  if (stored !== null) {
    return null;
  }
  return sanitiseRichTextHtml(contentHtml ?? '');
}

/** FR-E5-35: the party and content rules the type row declares, as a 422 naming each. */
function assertMatchesType(rules: ManagedDocumentTypeRules, shape: ManagedDocumentShape): void {
  const issues = validateManagedDocumentAgainstType(rules, shape);
  if (issues.length === 0) {
    return;
  }
  throw new UnprocessableEntityException({
    message: 'This document does not match the rules of its type',
    code: MANAGED_DOCUMENT_TYPE_RULE_ERROR_CODE,
    errors: { issues },
  });
}

/** What the row would look like after the edit — the rules apply to the result. */
function resolveNextShape(
  existing: ManagedDocumentRecord,
  input: UpdateManagedDocumentInput,
): ManagedDocumentShape {
  const nextHtml = input.contentHtml === undefined ? existing.contentHtml : input.contentHtml;
  const nextKey = input.storageKey === undefined ? existing.storageKey : input.storageKey;
  return {
    patientId: input.patientId === undefined ? (existing.patient?.id ?? null) : input.patientId,
    doctorId: input.doctorId === undefined ? (existing.doctor?.id ?? null) : input.doctorId,
    hasContentHtml: nextHtml !== null,
    hasStorageKey: nextKey !== null,
  };
}

function assertEditable(record: ManagedDocumentRecord): void {
  if (record.type.behavior === 'PATIENT_BILL' || !EDITABLE_STATUSES.includes(record.status)) {
    throw new ConflictException({
      message:
        record.type.behavior === 'PATIENT_BILL'
          ? 'A generated patient bill is never edited in the registry'
          : 'Only a draft or a document under review can be edited',
      code: MANAGED_DOCUMENT_NOT_EDITABLE_ERROR_CODE,
      errors: { status: record.status },
    });
  }
}

/**
 * The DTO refuses a request naming both bodies; this refuses an edit that
 * would *leave* the row with both — adding a storage key to a drafted
 * document without clearing its HTML, or the reverse.
 */
function assertContentStaysExclusive(
  existing: ManagedDocumentRecord,
  input: UpdateManagedDocumentInput,
): void {
  const nextHtml = input.contentHtml === undefined ? existing.contentHtml : input.contentHtml;
  const nextKey = input.storageKey === undefined ? existing.storageKey : input.storageKey;
  if (nextHtml !== null && nextKey !== null) {
    throw new UnprocessableEntityException({
      message: 'A document is drafted or uploaded, never both — clear one before setting the other',
      code: MANAGED_DOCUMENT_CONTENT_CONFLICT_ERROR_CODE,
    });
  }
}

/** The stored object's type must be one the store accepts — the signed declaration, read back. */
function resolveStoredMimeType(contentType: string | undefined): DocumentUploadMimeTypeValue {
  const accepted = DOCUMENT_UPLOAD_MIME_TYPES.find((mimeType) => mimeType === contentType);
  if (accepted === undefined) {
    throw new BadRequestException('Uploaded file is not an accepted document type');
  }
  return accepted;
}

function describeContent(record: ManagedDocumentRecord): 'DRAFTED' | 'UPLOADED' | 'EMPTY' {
  if (record.storageKey !== null) {
    return 'UPLOADED';
  }
  return record.contentHtml === null ? 'EMPTY' : 'DRAFTED';
}

function listChangedFields(input: UpdateManagedDocumentInput): string[] {
  return Object.keys(input)
    .filter((key) => input[key as keyof UpdateManagedDocumentInput] !== undefined)
    .sort();
}

function buildExportFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `documents-${stamp}.csv`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
