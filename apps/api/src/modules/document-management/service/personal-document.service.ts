import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfirmPersonalDocumentUploadInput,
  CreatePersonalDocumentUploadUrlInput,
  DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE,
  DOCUMENT_UPLOAD_MIME_TYPES,
  DeletedPersonalDocumentView,
  DocumentOwnerTypeValue,
  DocumentRecord,
  DocumentUploadMimeTypeValue,
  ListPersonalDocumentsQueryInput,
  PersonalDocumentDownloadView,
  PersonalDocumentListView,
  PersonalDocumentUploadUrlView,
  PersonalDocumentView,
  UpdatePersonalDocumentInput,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { HeadObjectResult } from '../../../common/storage/storage.types';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { DocumentRepository } from '../repository/document.repository';
import { buildDocumentDownloadDisposition } from './build-document-download-disposition';
import { isPersonalDocumentStorageKey } from './is-personal-document-storage-key';
import { buildPersonalDocumentStorageKeyPrefix } from './personal-document-storage-key-prefix';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/** The owner types that may keep a personal knowledge base (§5.5). */
type PersonalDocumentOwnerType = Extract<DocumentOwnerTypeValue, 'DOCTOR' | 'ADMIN'>;

/**
 * A user's **own** knowledge base — guidelines, formularies, playbooks a
 * doctor or admin keeps for themselves (`P15-T20`, ai-chatbot-tools.md §5.1 A
 * and §5.5). Retrieved only in that user's own in-app chat sessions, and never
 * in the patient channel or the WA/Telegram channel.
 *
 * **Ownership is derived, never accepted.** Every method resolves `ownerType`
 * and `ownerId` from the authenticated actor and passes them to the repository
 * as query predicates. No route takes an owner in its body or its path, so
 * there is no shape of request that reads or writes someone else's corpus —
 * another user's document is not forbidden, it is not found, because it was
 * never in the queried set.
 *
 * That matters more here than the usual ownership check, because
 * `DocumentService` and this service write to the same table. The public
 * channel's retrieval filter keys on `ownerType = CLINIC` +
 * `purpose = FAQ_KNOWLEDGE_BASE`, so a caller who could set either field on
 * this route would be publishing into the corpus patients read. Both are
 * pinned below and neither appears in a request schema.
 */
@Injectable()
export class PersonalDocumentService {
  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly authRepository: AuthRepository,
    private readonly uploadedDocumentGuardService: UploadedDocumentGuardService,
  ) {}

  /**
   * Signs one browser-direct upload into the caller's own corpus. Nothing is
   * persisted here: a signed URL nobody uses must leave no row behind.
   */
  async createUploadUrl(
    input: CreatePersonalDocumentUploadUrlInput,
    actor: CurrentUser,
  ): Promise<PersonalDocumentUploadUrlView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'write');
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: buildPersonalDocumentStorageKeyPrefix(ownerType),
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
   * Records a completed upload as a document in the caller's own corpus.
   *
   * `purpose` is pinned to `PERSONAL_KNOWLEDGE_BASE` and the owner to the
   * actor. The size and MIME type come from the stored object rather than the
   * request body, and the key must be one this service minted for *this*
   * owner type — a confirm naming a clinic key is refused rather than turned
   * into a personal row pointing at the shared corpus.
   */
  async confirmUpload(
    input: ConfirmPersonalDocumentUploadInput,
    actor: CurrentUser,
  ): Promise<PersonalDocumentView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'write');
    if (!isPersonalDocumentStorageKey(input.storageKey, ownerType)) {
      throw new BadRequestException(
        'Storage key was not issued for an upload to your knowledge base',
      );
    }
    const storedObject = await this.readUploadedObject(input.storageKey);
    const mimeType = this.resolveStoredMimeType(storedObject.contentType);
    if (storedObject.sizeBytes <= 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    await this.uploadedDocumentGuardService.assertUploadedContentMatches({
      storageKey: input.storageKey,
      declaredMimeType: mimeType,
      actorUserId: actor.sub,
    });
    try {
      const record = await this.documentRepository.createDocument({
        ownerType,
        ownerId: actor.sub,
        purpose: 'PERSONAL_KNOWLEDGE_BASE',
        title: input.title,
        storageKey: input.storageKey,
        mimeType,
        sizeBytes: storedObject.sizeBytes,
        // A personal document is scoped by owner, not by channel, so channel
        // visibility is left at the column default and never read for it.
        visibility: 'BOTH',
        language: input.language,
        ingestStatus: 'PENDING',
        uploadedById: actor.sub,
      });
      return this.toView(record);
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        throw new ConflictException('This upload has already been recorded as a document');
      }
      throw err;
    }
  }

  async listDocuments(
    query: ListPersonalDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<PersonalDocumentListView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'read');
    const page = await this.documentRepository.listDocuments({
      ownerType,
      ownerId: actor.sub,
      purpose: 'PERSONAL_KNOWLEDGE_BASE',
      ingestStatus: query.ingestStatus,
      language: query.language,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((record) => this.toView(record)),
      nextCursor: page.nextCursor,
    };
  }

  async getDocument(id: string, actor: CurrentUser): Promise<PersonalDocumentView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'read');
    return this.toView(await this.requireOwnedDocument(id, ownerType, actor.sub));
  }

  /**
   * Mints a short-lived signed download URL for the caller's own document.
   * The URL is issued per request and never persisted, so it expires on its
   * own rather than sitting in a client's cached list.
   */
  async getDownloadUrl(id: string, actor: CurrentUser): Promise<PersonalDocumentDownloadView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'read');
    const record = await this.requireOwnedDocument(id, ownerType, actor.sub);
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
   * Edits title or language. The stored file is immutable, and chunks carry a
   * copy of `language`, so a language change discards them rather than leaving
   * stale copies retrievable under a value the document no longer has.
   */
  async updateDocument(
    id: string,
    input: UpdatePersonalDocumentInput,
    actor: CurrentUser,
  ): Promise<PersonalDocumentView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'write');
    const record = await this.requireOwnedDocument(id, ownerType, actor.sub);
    const hasRetrievalChange = input.language !== undefined && input.language !== record.language;
    const updated = await this.documentRepository.updateDocument(
      id,
      {
        title: input.title,
        language: input.language,
        ingestStatus: hasRetrievalChange ? 'PENDING' : undefined,
      },
      hasRetrievalChange,
    );
    return this.toView(updated);
  }

  /**
   * Retires a document from the caller's own corpus. Chunks and their vectors
   * go with it, which is what makes the document stop being retrievable — the
   * count is returned as the owner's evidence that it did.
   */
  async deleteDocument(id: string, actor: CurrentUser): Promise<DeletedPersonalDocumentView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'write');
    await this.requireOwnedDocument(id, ownerType, actor.sub);
    const result = await this.documentRepository.softDeleteDocument(id);
    return {
      id: result.document.id,
      deletedAt: result.deletedAt.toISOString(),
      chunksRemoved: result.chunksRemoved,
    };
  }

  /** Returns one of the caller's documents to the ingestion queue. */
  async reingestDocument(id: string, actor: CurrentUser): Promise<PersonalDocumentView> {
    const ownerType = await this.resolvePersonalOwnerType(actor, 'write');
    await this.requireOwnedDocument(id, ownerType, actor.sub);
    return this.toView(await this.documentRepository.markDocumentPending(id));
  }

  /**
   * Loads a document that belongs to this caller, or reports it missing.
   *
   * The owner is a **predicate of the query**, not a check on the result, so
   * another user's document is never a row this service held and decided to
   * refuse. `NotFound` rather than `Forbidden` is deliberate for the same
   * reason the REST API uses it elsewhere: distinguishing the two would
   * confirm that a given document id exists.
   */
  private async requireOwnedDocument(
    id: string,
    ownerType: PersonalDocumentOwnerType,
    ownerId: string,
  ): Promise<DocumentRecord> {
    const record = await this.documentRepository.findDocumentById(id, ownerType, ownerId);
    if (record === null || record.purpose !== 'PERSONAL_KNOWLEDGE_BASE') {
      throw new NotFoundException('Document not found');
    }
    return record;
  }

  /**
   * Resolves which personal corpus the actor owns, and proves they may act on
   * it at `OWN` scope.
   *
   * The global guard proves the actor may act on *some* `Document`; it cannot
   * distinguish scope, because a CASL rule carrying an ownership condition
   * still answers "can write Document" for the subject type. Checking the
   * seeded `OWN` grant here is what stops a role holding only `ANY` — or
   * neither — from opening a personal corpus through these routes.
   *
   * The owner type comes from the actor's role rather than the request: a
   * clinician's corpus is `DOCTOR`, an administrator's is `ADMIN`, and a user
   * who is neither has no personal corpus to open.
   */
  private async resolvePersonalOwnerType(
    actor: CurrentUser,
    action: 'read' | 'write',
  ): Promise<PersonalDocumentOwnerType> {
    const actorRecord = await this.authRepository.findUserById(actor.sub);
    if (!actorRecord) {
      throw new UnauthorizedException('User not found');
    }
    const hasOwnScope = actorRecord.roles
      .flatMap((userRole) => userRole.role.permissions)
      .some(
        (rolePermission) =>
          rolePermission.permission.resource === 'Document' &&
          rolePermission.permission.action === action &&
          rolePermission.permission.scope === 'OWN',
      );
    if (!hasOwnScope) {
      throw new ForbiddenException('You are not allowed to manage a personal knowledge base');
    }
    // `code`, not `name`: the code is the unique, stable identifier roles are
    // seeded and matched by, while `name` is a display string an admin may
    // edit. Keying ownership off a mutable label would let a rename silently
    // move which corpus a user opens.
    const roleCodes = actorRecord.roles.map((userRole) => userRole.role.code);
    if (roleCodes.includes('DOCTOR')) {
      return 'DOCTOR';
    }
    if (roleCodes.includes('ADMIN') || roleCodes.includes('SUPER_ADMIN')) {
      return 'ADMIN';
    }
    throw new ForbiddenException('You are not allowed to manage a personal knowledge base');
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

  private toView(record: DocumentRecord): PersonalDocumentView {
    return {
      id: record.id,
      ownerType: record.ownerType,
      ownerId: record.ownerId ?? '',
      purpose: record.purpose,
      title: record.title,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      language: record.language,
      ingestStatus: record.ingestStatus,
      ingestError: record.ingestError,
      ingestedAt: record.ingestedAt?.toISOString() ?? null,
      chunkCount: record.chunkCount,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
