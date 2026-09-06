import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ClinicDocumentApprovalView,
  ClinicDocumentDownloadView,
  ClinicDocumentListView,
  ClinicDocumentUploadUrlView,
  ClinicDocumentView,
  ConfirmClinicDocumentUploadInput,
  CreateClinicDocumentUploadUrlInput,
  DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE,
  DOCUMENT_MAX_UPLOAD_SIZE_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  DeletedClinicDocumentView,
  DocumentIngestStatusValue,
  DocumentPurposeValue,
  DocumentRecord,
  DocumentUploadMimeTypeValue,
  INGESTIBLE_DOCUMENT_PURPOSES,
  ListClinicDocumentsQueryInput,
  UpdateClinicDocumentInput,
  isDocumentImageMimeType,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { HeadObjectResult } from '../../../common/storage/storage.types';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { DocumentRepository } from '../repository/document.repository';
import { buildDocumentDownloadDisposition } from './build-document-download-disposition';
import { ClinicCorpusApprovalService } from './clinic-corpus-approval.service';
import { CLINIC_DOCUMENT_STORAGE_KEY_PREFIX } from './clinic-document-storage-key-prefix';
import { isClinicDocumentStorageKey } from './is-clinic-document-storage-key';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/** What a document with no registry row reports: no workflow, nothing pending. */
const NO_CLINIC_DOCUMENT_APPROVAL: ClinicDocumentApprovalView = {
  isApprovalRequired: false,
  managedDocumentId: null,
  status: null,
  pendingRound: null,
};

/**
 * Admin management of the **clinic corpus** — the shared knowledge base the
 * chat channels retrieve from, plus the general documents that are stored but
 * never embedded. Personal knowledge bases (`ownerType = DOCTOR | ADMIN`) are
 * `P15-T20` and are deliberately not reachable from here: every read and
 * write in this service pins `ownerType = CLINIC`, `ownerId = null`.
 *
 * Uploads never proxy through the API. The client asks for a signed URL,
 * PUTs the file to storage directly, then confirms — and confirmation reads
 * the object's real size and type back from storage rather than believing the
 * request body, because a client's claim about what it uploaded is not
 * evidence of what is in the bucket.
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly authRepository: AuthRepository,
    private readonly uploadedDocumentGuardService: UploadedDocumentGuardService,
    private readonly corpusApprovalService: ClinicCorpusApprovalService,
  ) {}

  /**
   * Signs one browser-direct upload. Nothing is persisted here: a signed URL
   * nobody uses must leave no row behind, so the document only exists once
   * {@link confirmUpload} has seen the object in storage.
   */
  async createUploadUrl(
    input: CreateClinicDocumentUploadUrlInput,
    actor: CurrentUser,
  ): Promise<ClinicDocumentUploadUrlView> {
    await this.assertClinicCorpusScope(actor, 'write');
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: CLINIC_DOCUMENT_STORAGE_KEY_PREFIX,
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

  /**
   * Records a completed upload as a clinic-corpus document. The size and MIME
   * type on the row come from the stored object, and the key must be one this
   * module minted — a confirm call naming another feature's object is refused
   * rather than turned into a document row with a signed download URL.
   */
  async confirmUpload(
    input: ConfirmClinicDocumentUploadInput,
    actor: CurrentUser,
  ): Promise<ClinicDocumentView> {
    await this.assertClinicCorpusScope(actor, 'write');
    if (!isClinicDocumentStorageKey(input.storageKey)) {
      throw new BadRequestException('Storage key was not issued for a clinic document upload');
    }
    const storedObject = await this.readUploadedObject(input.storageKey);
    const mimeType = this.resolveStoredMimeType(storedObject.contentType);
    this.assertStoredSizeWithinLimit(storedObject.sizeBytes);
    // The size on the row comes from the guard, not from the head above: an
    // image is re-encoded in place, so what the client uploaded and what the
    // bucket now holds are different objects of different lengths.
    const guarded = await this.uploadedDocumentGuardService.guardUploadedDocument({
      storageKey: input.storageKey,
      declaredMimeType: mimeType,
      actorUserId: actor.sub,
    });
    try {
      const record = await this.documentRepository.createDocument({
        ownerType: 'CLINIC',
        ownerId: null,
        purpose: input.purpose,
        title: input.title,
        storageKey: input.storageKey,
        mimeType,
        sizeBytes: guarded.sizeBytes,
        visibility: input.visibility,
        language: input.language,
        // FR-E5-19. Under an active policy the file lands stored but
        // unqueued: `NOT_APPLICABLE` is what keeps the worker blind to it
        // until an approval releases it, and the retrieval predicate keeps
        // the assistant blind to it even if something ever queued it anyway.
        ingestStatus: await this.corpusApprovalService.resolveGatedIngestStatus(
          this.resolveInitialIngestStatus(input.purpose, mimeType),
        ),
        uploadedById: actor.sub,
      });
      await this.corpusApprovalService.syncRegistryRow(record, actor);
      return this.toViewWithApproval(record);
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        throw new ConflictException('This upload has already been recorded as a document');
      }
      throw err;
    }
  }

  async listDocuments(
    query: ListClinicDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<ClinicDocumentListView> {
    await this.assertClinicCorpusScope(actor, 'read');
    const page = await this.documentRepository.listDocuments({
      ownerType: 'CLINIC',
      ownerId: null,
      purpose: query.purpose,
      ingestStatus: query.ingestStatus,
      visibility: query.visibility,
      language: query.language,
      cursor: query.cursor,
      limit: query.limit,
    });
    // Two queries for the whole page's approval state (`P16-T33`), not one
    // per row: the corpus list carries the approval column on every row.
    const approvals = await this.corpusApprovalService.resolveApprovalViews(
      page.items.map((record) => record.id),
    );
    return {
      items: page.items.map((record) => this.toView(record, approvals.get(record.id))),
      nextCursor: page.nextCursor,
    };
  }

  async getDocument(id: string, actor: CurrentUser): Promise<ClinicDocumentView> {
    await this.assertClinicCorpusScope(actor, 'read');
    return this.toViewWithApproval(await this.requireClinicDocument(id));
  }

  /**
   * Mints a short-lived signed download URL. The URL is never persisted and
   * never rides along in a document view — it is issued per request so it
   * expires on its own instead of sitting in a client's cached list.
   */
  async getDownloadUrl(id: string, actor: CurrentUser): Promise<ClinicDocumentDownloadView> {
    await this.assertClinicCorpusScope(actor, 'read');
    const record = await this.requireClinicDocument(id);
    // Signed as response-header overrides (SJ-21): the storage origin serves
    // the file as an attachment under its validated stored type, so a
    // download can never render inline on the bucket origin.
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: record.storageKey,
      responseContentDisposition: buildDocumentDownloadDisposition(record),
      responseContentType: record.mimeType,
    });
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  /**
   * Edits title, visibility, or language. The stored file is immutable —
   * replacing content means uploading a new document — and an edit that
   * changes what retrieval may return discards the chunks that carry the old
   * values, so the corpus never answers under a visibility its document no
   * longer has.
   */
  async updateDocument(
    id: string,
    input: UpdateClinicDocumentInput,
    actor: CurrentUser,
  ): Promise<ClinicDocumentView> {
    await this.assertClinicCorpusScope(actor, 'write');
    const record = await this.requireClinicDocument(id);
    const hasVisibilityChange =
      input.visibility !== undefined && input.visibility !== record.visibility;
    const hasRetrievalChange =
      hasVisibilityChange || (input.language !== undefined && input.language !== record.language);
    // FR-E5-20. `visibility` is the field that decides whether the assistant
    // may quote this document to a patient, so changing it on an *issued*
    // corpus document is a new decision rather than an edit — and until that
    // decision is made, the document must not be re-queued behind the
    // clinic's back.
    const needsReapproval =
      hasVisibilityChange &&
      (await this.corpusApprovalService.requiresReapprovalOnVisibilityChange(id));
    const updated = await this.documentRepository.updateDocument(
      id,
      {
        title: input.title,
        visibility: input.visibility,
        language: input.language,
        ingestStatus: hasRetrievalChange
          ? needsReapproval
            ? 'NOT_APPLICABLE'
            : this.resolveInitialIngestStatus(record.purpose, record.mimeType)
          : undefined,
      },
      hasRetrievalChange,
    );
    if (needsReapproval) {
      await this.corpusApprovalService.reopenForVisibilityChange(id, actor);
    }
    return this.toViewWithApproval(updated);
  }

  async deleteDocument(id: string, actor: CurrentUser): Promise<DeletedClinicDocumentView> {
    await this.assertClinicCorpusScope(actor, 'write');
    await this.requireClinicDocument(id);
    const result = await this.documentRepository.softDeleteDocument(id);
    return {
      id: result.document.id,
      deletedAt: result.deletedAt.toISOString(),
      chunksRemoved: result.chunksRemoved,
    };
  }

  /**
   * Returns a document to the ingestion queue.
   *
   * Queueing rather than ingesting inline: extracting and embedding a long
   * PDF is tens of seconds of work, and an admin screen must not hold a
   * request open for it. The existing chunks are deliberately left in place
   * until the new set replaces them in one transaction, so a re-ingest of a
   * working document never makes it temporarily unanswerable — unlike a
   * visibility change, where discarding immediately is the safer failure.
   *
   * A `GENERAL` document is refused: it is stored and served but never
   * embedded, and queueing one would put a row in a queue the pipeline is
   * built to reject.
   */
  async reingestDocument(id: string, actor: CurrentUser): Promise<ClinicDocumentView> {
    await this.assertClinicCorpusScope(actor, 'write');
    const record = await this.requireClinicDocument(id);
    if (isDocumentImageMimeType(record.mimeType)) {
      throw new BadRequestException(
        'Images are stored but never ingested; there is no text to extract',
      );
    }
    if (this.resolveInitialIngestStatus(record.purpose, record.mimeType) !== 'PENDING') {
      throw new BadRequestException(
        `Documents with purpose ${record.purpose} are stored but never ingested`,
      );
    }
    // §7.5.8. A manual re-ingest is the other door into the queue, so the
    // approval gate has to stand in front of it too — otherwise "not
    // ingested until approved" would hold only for the door with a button.
    await this.corpusApprovalService.assertIngestAllowed(record);
    return this.toViewWithApproval(await this.documentRepository.markDocumentPending(id));
  }

  /**
   * Sends an existing corpus document for review (`P16-T33`, R-19).
   *
   * The deliberate counterpart to the non-retroactive policy: turning
   * approval on changes nothing about documents the assistant already cites
   * (OQ-18), and this is how a clinic puts one of them in front of a second
   * pair of eyes when it wants to. The document leaves the retrieval
   * candidate set the moment its registry row exists and does not come back
   * until somebody approves it — which is what asking for a review means.
   */
  async sendForReview(id: string, actor: CurrentUser): Promise<ClinicDocumentView> {
    await this.assertClinicCorpusScope(actor, 'write');
    const record = await this.requireClinicDocument(id);
    if (this.resolveInitialIngestStatus(record.purpose, record.mimeType) !== 'PENDING') {
      throw new BadRequestException(
        `Documents with purpose ${record.purpose} are never retrieved, so there is nothing to review`,
      );
    }
    await this.corpusApprovalService.sendForReview(record, actor);
    return this.toViewWithApproval(record);
  }

  private async readUploadedObject(storageKey: string): Promise<HeadObjectResult> {
    try {
      return await this.objectStorageService.headObject({ key: storageKey });
    } catch (err) {
      if (err instanceof NotFoundException) {
        // A 404 here would read as "this endpoint does not exist". The
        // missing thing is the client's own upload, which is a request
        // problem it can retry.
        throw new BadRequestException(
          'No uploaded file was found for this storage key; upload the file to the signed URL before confirming',
        );
      }
      throw err;
    }
  }

  /**
   * The type on the row is the type of the object in the bucket. It was
   * signed into the upload URL, so it is what the provider accepted — and
   * re-reading it here means a stored object and its row can never disagree
   * about what the ingestion pipeline is about to try to parse.
   */
  private resolveStoredMimeType(contentType?: string): DocumentUploadMimeTypeValue {
    const normalized = contentType?.trim().toLowerCase();
    const accepted = DOCUMENT_UPLOAD_MIME_TYPES.find((mimeType) => mimeType === normalized);
    if (accepted === undefined) {
      throw new BadRequestException('Uploaded file is not an accepted document type');
    }
    return accepted;
  }

  /**
   * `PENDING` for the corpora the pipeline reads, `NOT_APPLICABLE` for
   * everything else. Derived from the shared purpose list rather than a local
   * branch, so a purpose added later cannot default itself into the
   * retrieval corpus by omission.
   *
   * An image is never ingestible, whatever its purpose (`P16-T03`). HMS runs
   * no OCR, so a photographed referral letter carries no text for retrieval
   * to find — and `PENDING` would send it to a worker that can only mark it
   * `FAILED`, filling the admin list with red rows for files doing exactly
   * what they were uploaded to do.
   */
  private resolveInitialIngestStatus(
    purpose: DocumentPurposeValue,
    mimeType: string,
  ): DocumentIngestStatusValue {
    if (isDocumentImageMimeType(mimeType)) {
      return 'NOT_APPLICABLE';
    }
    const isIngestible = INGESTIBLE_DOCUMENT_PURPOSES.some(
      (ingestiblePurpose) => ingestiblePurpose === purpose,
    );
    return isIngestible ? 'PENDING' : 'NOT_APPLICABLE';
  }

  /**
   * The stored object's real length against the surface's cap. The cap was
   * signed into the upload URL, so the provider has already refused anything
   * larger — this is the check that keeps that true if a future path ever
   * writes into the bucket without going through a signature.
   */
  private assertStoredSizeWithinLimit(sizeBytes: number): void {
    if (sizeBytes <= 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    if (sizeBytes > DOCUMENT_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('Uploaded file is larger than the permitted size');
    }
  }

  private async requireClinicDocument(id: string): Promise<DocumentRecord> {
    const record = await this.documentRepository.findDocumentById(id, 'CLINIC', null);
    if (record === null) {
      throw new NotFoundException('Document not found');
    }
    return record;
  }

  /**
   * The global guard proves the actor may act on *some* `Document`; it cannot
   * distinguish the scope, because a CASL rule carrying an ownership
   * condition still answers "can read Document" affirmatively when asked
   * about the subject type. `DOCTOR` holds `document.read:own` and
   * `document.write:own` for their personal knowledge base, so without this
   * check every clinician would reach the clinic corpus — read *and* write —
   * through the admin routes.
   */
  private async assertClinicCorpusScope(
    actor: CurrentUser,
    action: 'read' | 'write',
  ): Promise<void> {
    const actorRecord = await this.authRepository.findUserById(actor.sub);
    if (!actorRecord) {
      throw new UnauthorizedException('User not found');
    }
    const hasAnyScope = actorRecord.roles
      .flatMap((userRole) => userRole.role.permissions)
      .some(
        (rolePermission) =>
          rolePermission.permission.resource === 'Document' &&
          rolePermission.permission.action === action &&
          rolePermission.permission.scope === 'ANY',
      );
    if (!hasAnyScope) {
      throw new ForbiddenException('You are not allowed to manage the clinic document corpus');
    }
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR_CODE
    );
  }

  /**
   * The approval block defaults to all-off when the caller did not resolve
   * one. That is the honest answer for every surface that is not the corpus
   * screen, and the safe one: a missing block must read as "no approval
   * workflow here", never as "approved".
   */
  private toView(record: DocumentRecord, approval?: ClinicDocumentApprovalView): ClinicDocumentView {
    return {
      id: record.id,
      ownerType: record.ownerType,
      ownerId: record.ownerId,
      purpose: record.purpose,
      title: record.title,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      visibility: record.visibility,
      language: record.language,
      ingestStatus: record.ingestStatus,
      ingestError: record.ingestError,
      ingestedAt: record.ingestedAt === null ? null : record.ingestedAt.toISOString(),
      chunkCount: record.chunkCount,
      uploadedById: record.uploadedById,
      approval: approval ?? NO_CLINIC_DOCUMENT_APPROVAL,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** One row's approval block, for the single-document reads. */
  private async toViewWithApproval(record: DocumentRecord): Promise<ClinicDocumentView> {
    return this.toView(record, await this.corpusApprovalService.resolveApprovalView(record.id));
  }
}
