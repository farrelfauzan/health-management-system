import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CreateManagedDocumentInput,
  ExportManagedDocumentsQueryInput,
  ListManagedDocumentsQueryInput,
  MANAGED_DOCUMENT_CONTENT_CONFLICT_ERROR_CODE,
  MANAGED_DOCUMENT_EXPORT_MAX_ROWS,
  MANAGED_DOCUMENT_NOT_EDITABLE_ERROR_CODE,
  ManagedDocumentAccessContext,
  ManagedDocumentDetailView,
  ManagedDocumentHistoryView,
  ManagedDocumentListView,
  ManagedDocumentRecord,
  ManagedDocumentStatusValue,
  UpdateManagedDocumentInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { sanitiseRichTextHtml } from '../../../common/html/sanitise-rich-text-html';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { ManagedDocumentRepository } from '../repository/managed-document.repository';
import { buildManagedDocumentCsv } from './build-managed-document-csv';
import { DocumentTypeService } from './document-type.service';
import { isManagedDocumentStorageKey } from './is-managed-document-storage-key';
import { ManagedDocumentAccessService } from './managed-document-access.service';
import { toManagedDocumentDetailView, toManagedDocumentView } from './to-managed-document-view';

const MANAGED_DOCUMENT_AUDIT_RESOURCE = 'managed-document';

/** The only state a drafter may edit in (§7.5.10). */
const EDITABLE_STATUSES: readonly ManagedDocumentStatusValue[] = ['DRAFT'];

type StoredContent = { storageKey: string; storageMimeType: string; storageSizeBytes: number };

export type ManagedDocumentExport = { fileName: string; csv: string };

/**
 * The documents registry (`P16-T28`, FR-E5-01…05, FR-E5-07).
 *
 * Three rules are load-bearing:
 *
 *   * **Every read goes through the per-row source rule** (FR-E5-04). The
 *     access context is resolved once per request and handed to the
 *     repository, which folds it into the query; a row outside the caller's
 *     reach is absent from the list, absent from the count, and a 404 on
 *     the detail — never a 403 that confirms it exists.
 *   * **Drafted content is sanitised on every write** (NFR-SEC-01), with
 *     the same allowlist sanitiser the template editor uses. A document is
 *     drafted or uploaded, never both — the DTO refuses it, and this service
 *     refuses it again on an edit that would combine the two.
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
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  async listDocuments(
    query: ListManagedDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentListView> {
    const access = await this.accessService.resolveContext(actor);
    const page = await this.managedDocumentRepository.listDocuments({
      access,
      ...buildFilterParams(query),
      page: query.page,
      limit: query.limit,
    });
    return {
      items: page.items.map(toManagedDocumentView),
      meta: { page: query.page, limit: query.limit, total: page.total },
    };
  }

  async getDocument(id: string, actor: CurrentUser): Promise<ManagedDocumentDetailView> {
    const access = await this.accessService.resolveContext(actor);
    return toManagedDocumentDetailView(await this.findVisibleOrThrow(id, access));
  }

  async createDocument(
    input: CreateManagedDocumentInput,
    actor: CurrentUser,
  ): Promise<ManagedDocumentDetailView> {
    const type = await this.documentTypeService.findActiveTypeOrThrow(input.typeId);
    await this.assertPartiesExist(input.patientId ?? null, input.doctorId ?? null);
    const stored = await this.resolveStoredContent(input.storageKey ?? null);
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
    await this.assertPartiesExist(input.patientId ?? null, input.doctorId ?? null);
    const stored = await this.resolveStoredContent(input.storageKey ?? null);
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

  async getHistory(id: string, actor: CurrentUser): Promise<ManagedDocumentHistoryView> {
    const access = await this.accessService.resolveContext(actor);
    const record = await this.findVisibleOrThrow(id, access);
    const entries = await this.managedDocumentRepository.listHistory(id);
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
    const records = await this.managedDocumentRepository.listDocumentsForExport(
      { access, ...buildFilterParams(query) },
      MANAGED_DOCUMENT_EXPORT_MAX_ROWS,
    );
    await this.auditService.recordOrThrow({
      action: AuditAction.EXPORT,
      resource: MANAGED_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { rowCount: records.length, filters: buildFilterParams(query) },
    });
    return { fileName: buildExportFileName(), csv: buildManagedDocumentCsv(records) };
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
   * request: the key must be one this module minted, and the type and size
   * are read back from the bucket. The content gate that inspects the bytes
   * themselves sits in front of this under `P16-T36`'s upload flow.
   */
  private async resolveStoredContent(storageKey: string | null): Promise<StoredContent | null> {
    if (storageKey === null) {
      return null;
    }
    if (!isManagedDocumentStorageKey(storageKey)) {
      throw new BadRequestException('Storage key was not issued for a registry document upload');
    }
    const stored = await this.objectStorageService.headObject({ key: storageKey });
    if (stored.contentType === undefined || stored.contentType === null) {
      throw new BadRequestException('The uploaded object carries no content type');
    }
    return {
      storageKey,
      storageMimeType: stored.contentType,
      storageSizeBytes: stored.sizeBytes,
    };
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

function assertEditable(record: ManagedDocumentRecord): void {
  if (record.type.behavior === 'PATIENT_BILL' || !EDITABLE_STATUSES.includes(record.status)) {
    throw new ConflictException({
      message:
        record.type.behavior === 'PATIENT_BILL'
          ? 'A generated patient bill is never edited in the registry'
          : 'Only a draft can be edited',
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

function buildFilterParams(
  query: ExportManagedDocumentsQueryInput,
): Omit<Parameters<ManagedDocumentRepository['listDocuments']>[0], 'access' | 'page' | 'limit'> {
  return {
    typeId: query.typeId,
    status: query.status,
    draftedById: query.draftedBy,
    approverId: query.approver,
    from: query.from === undefined ? undefined : new Date(`${query.from}T00:00:00.000Z`),
    to: query.to === undefined ? undefined : new Date(`${query.to}T23:59:59.999Z`),
    dateField: query.dateField,
    search: query.q,
  };
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
