import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ConfirmPatientDocumentUploadInput,
  CreatePatientDocumentUploadUrlInput,
  DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE,
  DOCUMENT_MAX_UPLOAD_SIZE_BYTES,
  DOCUMENT_PAGE_MAX_LIMIT,
  DOCUMENT_UPLOAD_MIME_TYPES,
  DeletePatientDocumentInput,
  DeletedPatientDocumentView,
  DocumentRecord,
  DownloadPatientDocumentQueryInput,
  DocumentUploadMimeTypeValue,
  EncounterDocumentsView,
  ListPatientDocumentsQueryInput,
  ListPortalDocumentsQueryInput,
  PatientDocumentDownloadView,
  PatientDocumentListView,
  PatientDocumentReadAccess,
  PatientDocumentUploadUrlView,
  PatientDocumentView,
  PortalDocumentListView,
  PortalDocumentView,
  UpdatePatientDocumentInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { HeadObjectResult } from '../../../common/storage/storage.types';
import { AuditAction } from '../../../generated/prisma/client';
import { DocumentRepository } from '../repository/document.repository';
import { buildDocumentDownloadDisposition } from './build-document-download-disposition';
import { isPatientDocumentStorageKey } from './is-patient-document-storage-key';
import { PatientDocumentAccessService } from './patient-document-access.service';
import { PATIENT_DOCUMENT_STORAGE_KEY_PREFIX } from './patient-document-storage-key-prefix';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const PATIENT_DOCUMENT_AUDIT_RESOURCE = 'patient-document';

/**
 * Patient clinical files (`P16-T08`, PRD §7.2): every file that belongs to a
 * patient lives against that patient's record, uploaded through the same
 * presign → browser PUT → confirm flow as the corpus surfaces and hardened by
 * the same confirm-time guard (magic bytes, image re-encode).
 *
 * Three properties are load-bearing:
 *
 *   * **The patient is named by the route, never the body.** Purpose, owner
 *     type and ingest status are stated by the repository — a clinical file
 *     is always `PATIENT_CLINICAL`, never ingested (FR-E2-12) — so no request
 *     shape can move a document between corpora or feed one to retrieval.
 *   * **Scope is re-resolved per request** through
 *     {@link PatientDocumentAccessService}; the global guard cannot tell
 *     `ANY` from `OWN`, and a doctor's reach differs by verb (§7.2.4).
 *   * **Reads are audited** (FR-E2-07): the list/metadata routes through
 *     `@Audited()`, downloads/releases/deletes imperatively here because
 *     their rows carry context the interceptor cannot know. The audit write
 *     is awaited — a download whose access could not be recorded fails.
 */
@Injectable()
export class PatientDocumentService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly patientDocumentAccessService: PatientDocumentAccessService,
    private readonly uploadedDocumentGuardService: UploadedDocumentGuardService,
    private readonly auditService: AuditService,
  ) {}

  async createUploadUrl(
    patientId: string,
    input: CreatePatientDocumentUploadUrlInput,
    actor: CurrentUser,
  ): Promise<PatientDocumentUploadUrlView> {
    await this.assertCanWriteForPatient(patientId, actor, 'write');
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: PATIENT_DOCUMENT_STORAGE_KEY_PREFIX,
      fileExtension: DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE[input.mimeType],
    });
    const signedUpload = await this.objectStorageService.getSignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      contentLengthBytes: input.sizeBytes,
    });
    return {
      url: signedUpload.url,
      storageKey: signedUpload.key,
      expiresAt: signedUpload.expiresAt,
      requiredHeaders: signedUpload.requiredHeaders,
    };
  }

  async confirmUpload(
    patientId: string,
    input: ConfirmPatientDocumentUploadInput,
    actor: CurrentUser,
  ): Promise<PatientDocumentView> {
    await this.assertCanWriteForPatient(patientId, actor, 'write');
    if (!isPatientDocumentStorageKey(input.storageKey)) {
      throw new BadRequestException(
        'Storage key was not issued for a patient document upload',
      );
    }
    await this.assertEpisodeBelongsToPatient(patientId, input.encounterId, input.admissionId);
    const storedObject = await this.readUploadedObject(input.storageKey);
    const mimeType = this.resolveStoredMimeType(storedObject.contentType);
    this.assertStoredSizeWithinLimit(storedObject.sizeBytes);
    // The size on the row comes from the guard, not from the head above: an
    // image is re-encoded in place, so the stored object's length changes.
    const guarded = await this.uploadedDocumentGuardService.guardUploadedDocument({
      storageKey: input.storageKey,
      declaredMimeType: mimeType,
      actorUserId: actor.sub,
    });
    try {
      const record = await this.documentRepository.createPatientClinicalDocument({
        patientId,
        encounterId: input.encounterId,
        admissionId: input.admissionId,
        category: input.category,
        documentDate: input.documentDate === undefined ? undefined : new Date(input.documentDate),
        notes: input.notes,
        title: input.title,
        storageKey: input.storageKey,
        mimeType,
        sizeBytes: guarded.sizeBytes,
        language: input.language,
        uploadedById: actor.sub,
      });
      return this.toView(record, 'FULL');
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        throw new ConflictException('This upload has already been recorded as a document');
      }
      throw err;
    }
  }

  async listDocuments(
    patientId: string,
    query: ListPatientDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<PatientDocumentListView> {
    const access = await this.resolveReadAccessForPatient(patientId, actor);
    const page = await this.documentRepository.listPatientClinicalDocuments({
      patientId,
      category: query.category,
      encounterId: query.encounterId,
      admissionId: query.admissionId,
      documentDateFrom:
        query.documentDateFrom === undefined ? undefined : new Date(query.documentDateFrom),
      documentDateTo:
        query.documentDateTo === undefined ? undefined : new Date(query.documentDateTo),
      isReleasedToPatient: access === 'RELEASED_ONLY' ? true : undefined,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((record) => this.toView(record, access)),
      nextCursor: page.nextCursor,
    };
  }

  async getDocument(id: string, actor: CurrentUser): Promise<PatientDocumentView> {
    const { record, access } = await this.requireReadableDocument(id, actor);
    return this.toView(record, access);
  }

  /**
   * Mints a short-lived signed download URL and records who looked
   * (FR-E2-07/08). The audit write is awaited before the URL is returned: a
   * download whose access could not be recorded fails rather than handing
   * out the file unrecorded — "who looked" is the regulatory question.
   */
  async getDownloadUrl(
    id: string,
    actor: CurrentUser,
    query: DownloadPatientDocumentQueryInput = {},
  ): Promise<PatientDocumentDownloadView> {
    const { record } = await this.requireReadableDocument(id, actor);
    const readFromEncounterId = await this.resolveReadContextEncounterId(record, actor, query);
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: record.storageKey,
      responseContentDisposition: buildDocumentDownloadDisposition(record),
      responseContentType: record.mimeType,
    });
    await this.auditService.recordOrThrow({
      action: AuditAction.PATIENT_DOCUMENT_DOWNLOADED,
      resource: PATIENT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: record.id,
      patientId: record.patientId ?? undefined,
      metadata: {
        category: record.category,
        encounterId: record.encounterId,
        admissionId: record.admissionId,
        // Where the file *lives* is `encounterId` above; this is where it was
        // *read from* (P16-T14). A history document opened inside today's
        // consultation has a different value in each, and collapsing them
        // would make the log ambiguous exactly when it is being read back.
        readFromEncounterId,
        mimeType: record.mimeType,
      },
    });
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  /**
   * Validates the caller's claimed reading context before it reaches the audit
   * row (FR-E2-07).
   *
   * Two checks, and both matter. The encounter must belong to the same patient
   * as the document — otherwise a download could be stamped with an unrelated
   * visit, and the log would place a read somewhere it never happened. And the
   * caller must be able to read that encounter under the same OWN rule the
   * encounter route uses, so naming an encounter id is not a way to probe
   * whether one exists.
   */
  private async resolveReadContextEncounterId(
    record: DocumentRecord,
    actor: CurrentUser,
    query: DownloadPatientDocumentQueryInput,
  ): Promise<string | null> {
    if (query.encounterId === undefined) {
      return null;
    }
    const encounter = await this.documentRepository.findEncounterById(query.encounterId);
    if (encounter === null || encounter.patientId !== record.patientId) {
      throw new NotFoundException('Encounter not found');
    }
    await this.resolveReadAccessForPatient(encounter.patientId, actor);
    return encounter.id;
  }

  async updateDocument(
    id: string,
    input: UpdatePatientDocumentInput,
    actor: CurrentUser,
  ): Promise<PatientDocumentView> {
    const record = await this.requireDocument(id);
    await this.assertCanWriteForPatient(this.requirePatientId(record), actor, 'write');
    const resultingEncounterId =
      input.encounterId === undefined ? record.encounterId : input.encounterId;
    const resultingAdmissionId =
      input.admissionId === undefined ? record.admissionId : input.admissionId;
    if (resultingEncounterId !== null && resultingAdmissionId !== null) {
      throw new BadRequestException(
        'A document may be linked to an encounter or an admission, not both',
      );
    }
    await this.assertEpisodeBelongsToPatient(
      this.requirePatientId(record),
      input.encounterId ?? undefined,
      input.admissionId ?? undefined,
    );
    const updated = await this.documentRepository.updatePatientClinicalDocument(id, {
      title: input.title,
      category: input.category,
      documentDate:
        input.documentDate === undefined
          ? undefined
          : input.documentDate === null
            ? null
            : new Date(input.documentDate),
      notes: input.notes,
      encounterId: input.encounterId,
      admissionId: input.admissionId,
    });
    return this.toView(updated, 'FULL');
  }

  /**
   * Releases one document to the patient portal (FR-E2-13). Idempotent: the
   * first release wins the row and is the one audited; a repeat returns the
   * already-released document without rewriting `releasedAt`.
   */
  async releaseDocument(id: string, actor: CurrentUser): Promise<PatientDocumentView> {
    const record = await this.requireDocument(id);
    await this.assertCanWriteForPatient(this.requirePatientId(record), actor, 'release');
    const released = await this.documentRepository.releasePatientClinicalDocument(id, actor.sub);
    if (released === null) {
      return this.toView(record, 'FULL');
    }
    await this.auditService.recordOrThrow({
      action: AuditAction.PATIENT_DOCUMENT_RELEASED,
      resource: PATIENT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: released.id,
      patientId: released.patientId ?? undefined,
      metadata: { category: released.category, title: released.title },
    });
    return this.toView(released, 'FULL');
  }

  /**
   * Retires one document with a required reason (FR-E2-11). Soft only: the
   * row keeps its reason, the object stays in the bucket — clinical files
   * fall under the 25-year RME retention floor.
   */
  async deleteDocument(
    id: string,
    input: DeletePatientDocumentInput,
    actor: CurrentUser,
  ): Promise<DeletedPatientDocumentView> {
    const record = await this.requireDocument(id);
    await this.assertCanWriteForPatient(this.requirePatientId(record), actor, 'delete');
    const result = await this.documentRepository.softDeletePatientClinicalDocument(
      id,
      input.reason,
    );
    await this.auditService.recordOrThrow({
      action: AuditAction.DELETE,
      resource: PATIENT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: record.id,
      patientId: record.patientId ?? undefined,
      metadata: { reason: input.reason, category: record.category, title: record.title },
    });
    return {
      id: result.document.id,
      deletedAt: result.deletedAt.toISOString(),
      deleteReason: input.reason,
    };
  }

  /**
   * The encounter workspace's Documents panel (FR-E2-05): this visit's
   * documents first, then the rest of the patient's file. Both groups obey
   * the caller's read access — a patient viewing their own encounter sees
   * released files only.
   */
  async listEncounterDocuments(
    encounterId: string,
    actor: CurrentUser,
  ): Promise<EncounterDocumentsView> {
    const encounter = await this.documentRepository.findEncounterById(encounterId);
    if (encounter === null) {
      throw new NotFoundException('Encounter not found');
    }
    const access = await this.resolveReadAccessForPatient(encounter.patientId, actor);
    const page = await this.documentRepository.listPatientClinicalDocuments({
      patientId: encounter.patientId,
      isReleasedToPatient: access === 'RELEASED_ONLY' ? true : undefined,
      limit: DOCUMENT_PAGE_MAX_LIMIT,
    });
    const thisVisit = page.items.filter((record) => record.encounterId === encounterId);
    const history = page.items.filter((record) => record.encounterId !== encounterId);
    return {
      thisVisit: thisVisit.map((record) => this.toView(record, access)),
      history: history.map((record) => this.toView(record, access)),
    };
  }

  /** The patient portal's own list: released files only (FR-E2-13). */
  async listPortalDocuments(
    query: ListPortalDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<PortalDocumentListView> {
    const scope = await this.patientDocumentAccessService.resolveScopeOrThrow(actor, 'read');
    const patient = await this.documentRepository.findPatientProfileByOwnerUserId(actor.sub);
    if (patient === null) {
      throw new ForbiddenException('You have no patient record');
    }
    await this.patientDocumentAccessService.assertCanReadPatientDocuments({
      patientId: patient.id,
      patientOwnerUserId: patient.ownerUserId,
      scope,
      currentUser: actor,
    });
    const page = await this.documentRepository.listPatientClinicalDocuments({
      patientId: patient.id,
      category: query.category,
      isReleasedToPatient: true,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((record) => this.toPortalView(record)),
      nextCursor: page.nextCursor,
    };
  }

  private async resolveReadAccessForPatient(
    patientId: string,
    actor: CurrentUser,
  ): Promise<PatientDocumentReadAccess> {
    const scope = await this.patientDocumentAccessService.resolveScopeOrThrow(actor, 'read');
    const patient = await this.requirePatient(patientId);
    return this.patientDocumentAccessService.assertCanReadPatientDocuments({
      patientId,
      patientOwnerUserId: patient.ownerUserId,
      scope,
      currentUser: actor,
    });
  }

  private async assertCanWriteForPatient(
    patientId: string,
    actor: CurrentUser,
    action: 'write' | 'release' | 'delete',
  ): Promise<void> {
    const scope = await this.patientDocumentAccessService.resolveScopeOrThrow(actor, action);
    await this.requirePatient(patientId);
    await this.patientDocumentAccessService.assertCanWritePatientDocuments({
      patientId,
      scope,
      currentUser: actor,
      action,
    });
  }

  /**
   * Loads one live clinical file by id, before any access decision — the
   * record is what names the patient the decision is about. A caller who
   * fails the gate afterwards gets a 403 that reveals nothing beyond what
   * their probe already asserted.
   */
  private async requireDocument(id: string): Promise<DocumentRecord> {
    const record = await this.documentRepository.findPatientClinicalDocument(id);
    if (record === null) {
      throw new NotFoundException('Document not found');
    }
    return record;
  }

  /**
   * A readable document for this caller. A patient reading their own record
   * sees released files only — an unreleased one reports as not found, never
   * as forbidden, because "it exists but you may not see it yet" is exactly
   * the disclosure FR-E2-13 defers to the clinician.
   */
  private async requireReadableDocument(
    id: string,
    actor: CurrentUser,
  ): Promise<{ record: DocumentRecord; access: PatientDocumentReadAccess }> {
    const record = await this.requireDocument(id);
    const access = await this.resolveReadAccessForPatient(this.requirePatientId(record), actor);
    if (access === 'RELEASED_ONLY' && !record.releasedToPatient) {
      throw new NotFoundException('Document not found');
    }
    return { record, access };
  }

  private async requirePatient(
    patientId: string,
  ): Promise<{ id: string; ownerUserId: string | null }> {
    const patient = await this.documentRepository.findPatientProfileById(patientId);
    if (patient === null) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  /**
   * Verifies a named care episode belongs to this patient before linking it.
   * The FK proves the episode exists; only this check proves it is the same
   * patient's — a document linked to another patient's visit would be a
   * cross-record disclosure the CHECKs cannot see.
   */
  private async assertEpisodeBelongsToPatient(
    patientId: string,
    encounterId: string | undefined,
    admissionId: string | undefined,
  ): Promise<void> {
    if (encounterId !== undefined) {
      const encounter = await this.documentRepository.findEncounterForPatient(
        encounterId,
        patientId,
      );
      if (encounter === null) {
        throw new BadRequestException('Encounter does not belong to this patient');
      }
    }
    if (admissionId !== undefined) {
      const admission = await this.documentRepository.findAdmissionForPatient(
        admissionId,
        patientId,
      );
      if (admission === null) {
        throw new BadRequestException('Admission does not belong to this patient');
      }
    }
  }

  private async readUploadedObject(storageKey: string): Promise<HeadObjectResult> {
    try {
      return await this.objectStorageService.headObject({ key: storageKey });
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new BadRequestException(
          'No uploaded file was found for this storage key; upload the file to the signed URL before confirming',
        );
      }
      throw err;
    }
  }

  private assertStoredSizeWithinLimit(sizeBytes: number): void {
    if (sizeBytes <= 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    if (sizeBytes > DOCUMENT_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('Uploaded file is larger than the permitted size');
    }
  }

  private resolveStoredMimeType(contentType?: string): DocumentUploadMimeTypeValue {
    const normalized = contentType?.trim().toLowerCase();
    const accepted = DOCUMENT_UPLOAD_MIME_TYPES.find((mimeType) => mimeType === normalized);
    if (accepted === undefined) {
      throw new BadRequestException('Uploaded file is not an accepted document type');
    }
    return accepted;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
    );
  }

  private requirePatientId(record: DocumentRecord): string {
    if (record.patientId === null) {
      throw new NotFoundException('Document not found');
    }
    return record.patientId;
  }

  private toView(record: DocumentRecord, access: PatientDocumentReadAccess): PatientDocumentView {
    return {
      id: record.id,
      patientId: this.requirePatientId(record),
      encounterId: record.encounterId,
      admissionId: record.admissionId,
      category: record.category ?? 'OTHER',
      title: record.title,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      language: record.language,
      documentDate: record.documentDate?.toISOString().slice(0, 10) ?? null,
      // Staff working notes stay staff-side: a patient reading their own
      // released file gets the document, not the annotations around it.
      notes: access === 'RELEASED_ONLY' ? null : record.notes,
      releasedToPatient: record.releasedToPatient,
      releasedAt: record.releasedAt?.toISOString() ?? null,
      releasedById: record.releasedById,
      uploadedById: record.uploadedById,
      uploadedByEmail: record.uploadedByEmail,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toPortalView(record: DocumentRecord): PortalDocumentView {
    return {
      id: record.id,
      category: record.category ?? 'OTHER',
      title: record.title,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      documentDate: record.documentDate?.toISOString().slice(0, 10) ?? null,
      releasedAt: record.releasedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
