import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ConfirmVaultDocumentUploadInput,
  CreateVaultDocumentUploadUrlInput,
  DOCUMENT_FILE_EXTENSION_BY_MIME_TYPE,
  DOCUMENT_MAX_UPLOAD_SIZE_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  DeletedVaultDocumentView,
  DocumentRecord,
  DocumentUploadMimeTypeValue,
  ListVaultDocumentsQueryInput,
  UpdateVaultDocumentInput,
  VaultDocumentDownloadView,
  VaultDocumentListView,
  VaultDocumentUploadUrlView,
  VaultDocumentView,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { HeadObjectResult } from '../../../common/storage/storage.types';
import { AuditAction } from '../../../generated/prisma/client';
import { VaultDocumentRepository } from '../repository/vault-document.repository';
import { VaultDocumentAccessService } from './vault-document-access.service';
import { buildDocumentDownloadDisposition } from './build-document-download-disposition';
import { isVaultDocumentStorageKey } from './is-vault-document-storage-key';
import { toVaultDocumentView } from './to-vault-document-view';
import { buildVaultDocumentStorageKeyPrefix } from './vault-document-storage-key-prefix';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

/** The audit `resource` every vault row is written under. */
export const VAULT_DOCUMENT_AUDIT_RESOURCE = 'vault-document';

/**
 * A practitioner's **own** paperwork — their STR, their ijazah, their KTP
 * (`P16-T17`, §7.3.1). Stored and served, never ingested, never sent to any
 * AI provider.
 *
 * **Privacy here is structural rather than granted.** Ownership is derived
 * from the authenticated actor and never accepted from a request: no route in
 * this surface takes an owner in its path, body or query (FR-E3-02), and no
 * `read:any` / `write:any` permission key exists for it at all — for any role,
 * including ADMIN (FR-E3-03). There is nothing to grant that would let one
 * person browse another's vault, which is a stronger guarantee than a
 * permission nobody currently holds.
 *
 * Distinct from `PersonalDocumentService`, which is the *knowledge base* at
 * `me/documents`. That corpus is chunked and its passages are sent to the
 * embedding provider; this one is not. The two services write to the same
 * table through different repositories, under different storage-key prefixes,
 * with different purposes pinned server-side, precisely so that no single
 * mistake can turn a document of one kind into a document of the other.
 */
@Injectable()
export class VaultDocumentService {
  constructor(
    private readonly vaultDocumentRepository: VaultDocumentRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly vaultDocumentAccessService: VaultDocumentAccessService,
    private readonly uploadedDocumentGuardService: UploadedDocumentGuardService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Signs one browser-direct upload into the caller's own vault. Nothing is
   * persisted here: a signed URL nobody uses must leave no row behind.
   */
  async createUploadUrl(
    input: CreateVaultDocumentUploadUrlInput,
    actor: CurrentUser,
  ): Promise<VaultDocumentUploadUrlView> {
    const ownerType = await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'write');
    const storageKey = this.objectStorageService.generateObjectKey({
      keyPrefix: buildVaultDocumentStorageKeyPrefix(ownerType),
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
   * Records a completed upload as a document in the caller's own vault.
   *
   * The key must be one this service minted for *this* owner type. A confirm
   * naming a knowledge-base key is refused rather than turned into a vault row
   * pointing at a corpus object — the reverse mistake, a vault object confirmed
   * into the knowledge base, is the one that would send a doctor's KTP to an
   * embedding provider, and the same check on the other surface refuses it.
   */
  async confirmUpload(
    input: ConfirmVaultDocumentUploadInput,
    actor: CurrentUser,
  ): Promise<VaultDocumentView> {
    const ownerType = await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'write');
    if (!isVaultDocumentStorageKey(input.storageKey, ownerType)) {
      throw new BadRequestException('Storage key was not issued for an upload to your vault');
    }
    this.assertIssueBeforeExpiry(input.issuedAt, input.expiresAt);
    const storedObject = await this.readUploadedObject(input.storageKey);
    const mimeType = this.resolveStoredMimeType(storedObject.contentType);
    this.assertStoredSizeWithinLimit(storedObject.sizeBytes);
    // The size on the row comes from the guard, not from the head above: an
    // image is re-encoded in place, so what the client uploaded and what the
    // bucket now holds are different objects of different lengths. That
    // re-encode is also what strips EXIF GPS from a photographed licence
    // (US-E3-01).
    const guarded = await this.uploadedDocumentGuardService.guardUploadedDocument({
      storageKey: input.storageKey,
      declaredMimeType: mimeType,
      actorUserId: actor.sub,
    });
    try {
      const record = await this.vaultDocumentRepository.createVaultDocument({
        ownerType,
        ownerId: actor.sub,
        title: input.title,
        storageKey: input.storageKey,
        mimeType,
        sizeBytes: guarded.sizeBytes,
        language: input.language,
        vaultCategory: input.vaultCategory,
        referenceNumber: input.referenceNumber,
        issuedAt: this.toDate(input.issuedAt),
        expiresAt: this.toDate(input.expiresAt),
        uploadedById: actor.sub,
      });
      return toVaultDocumentView(record);
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        throw new ConflictException('This upload has already been recorded as a document');
      }
      throw err;
    }
  }

  async listDocuments(
    query: ListVaultDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<VaultDocumentListView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'read');
    const page = await this.vaultDocumentRepository.listVaultDocuments({
      ownerId: actor.sub,
      search: query.search,
      vaultCategory: query.vaultCategory,
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((record) => toVaultDocumentView(record)),
      nextCursor: page.nextCursor,
    };
  }

  async getDocument(id: string, actor: CurrentUser): Promise<VaultDocumentView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'read');
    return toVaultDocumentView(await this.requireOwnedDocument(id, actor.sub));
  }

  /**
   * Mints a short-lived signed download URL for the caller's own document,
   * and records that it did **before** returning the URL. If the access
   * cannot be recorded, no URL is issued — a read that left no trace is one
   * the owner cannot later discover.
   */
  async getDownloadUrl(id: string, actor: CurrentUser): Promise<VaultDocumentDownloadView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'read');
    const record = await this.requireOwnedDocument(id, actor.sub);
    // Signed as response-header overrides (SJ-21): the storage origin serves
    // the file as an attachment under its validated stored type, so a
    // download can never render inline on the bucket origin.
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: record.storageKey,
      responseContentDisposition: buildDocumentDownloadDisposition(record),
      responseContentType: record.mimeType,
    });
    await this.auditService.recordOrThrow({
      action: AuditAction.VAULT_DOCUMENT_DOWNLOADED,
      resource: VAULT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: record.id,
      metadata: { vaultCategory: record.vaultCategory, mimeType: record.mimeType },
    });
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  /**
   * Edits the owner's own filing notes (FR-E3-01). The stored file is
   * immutable; only what its owner says about it changes.
   */
  async updateDocument(
    id: string,
    input: UpdateVaultDocumentInput,
    actor: CurrentUser,
  ): Promise<VaultDocumentView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'write');
    const record = await this.requireOwnedDocument(id, actor.sub);
    this.assertIssueBeforeExpiry(
      input.issuedAt === undefined ? this.toIsoDate(record.issuedAt) : input.issuedAt,
      input.expiresAt === undefined ? this.toIsoDate(record.expiresAt) : input.expiresAt,
    );
    const updated = await this.vaultDocumentRepository.updateVaultDocument(id, actor.sub, {
      title: input.title,
      vaultCategory: input.vaultCategory,
      referenceNumber: input.referenceNumber,
      issuedAt: this.toNullableDate(input.issuedAt),
      expiresAt: this.toNullableDate(input.expiresAt),
    });
    if (updated === null) {
      throw new NotFoundException('Document not found');
    }
    return toVaultDocumentView(updated);
  }

  /**
   * **Hard**-deletes one of the caller's own documents (FR-E3-09): the row,
   * the stored object, and every expiry notice about it.
   *
   * No soft delete and no retention floor. The 25-year RME rule is about a
   * patient's medical record; applying it here would mean the product
   * refusing to forget a person's own identity documents when they ask.
   */
  async deleteDocument(id: string, actor: CurrentUser): Promise<DeletedVaultDocumentView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'write');
    const result = await this.vaultDocumentRepository.deleteVaultDocument(id, actor.sub);
    if (result === null) {
      throw new NotFoundException('Document not found');
    }
    // The row is already gone; a failure to remove the object leaves an
    // orphan in the bucket rather than a document the owner thinks they
    // deleted, which is the better of the two failures.
    await this.objectStorageService.deleteObject({ key: result.storageKey });
    return { id: result.id, deleted: true };
  }

  /** Every document in the caller's own vault, for the export archive. */
  async listAllForExport(actor: CurrentUser): Promise<DocumentRecord[]> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'read');
    const records: DocumentRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.vaultDocumentRepository.listVaultDocuments({
        ownerId: actor.sub,
        cursor,
        limit: 100,
      });
      records.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return records;
  }

  /** Records that a whole vault left the system in one file (FR-E3-12). */
  async recordExport(actor: CurrentUser, documentCount: number): Promise<void> {
    await this.auditService.recordOrThrow({
      action: AuditAction.VAULT_DOCUMENT_EXPORTED,
      resource: VAULT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: actor.sub,
      metadata: { documentCount },
    });
  }

  /** Streams one stored object's bytes, for the export archive. */
  async readStoredObject(storageKey: string): Promise<Buffer> {
    const stored = await this.objectStorageService.getObject({ key: storageKey });
    return Buffer.from(stored.body);
  }

  /**
   * Loads a document that belongs to this caller, or reports it missing.
   *
   * The owner is a **predicate of the query**, not a check on the result, so
   * another user's document is never a row this service held and decided to
   * refuse. `NotFound` rather than `Forbidden` is deliberate: distinguishing
   * the two would confirm that a given document id exists, which is itself a
   * disclosure about someone else's vault.
   */
  private async requireOwnedDocument(id: string, ownerId: string): Promise<DocumentRecord> {
    const record = await this.vaultDocumentRepository.findVaultDocumentById(id, ownerId);
    if (record === null) {
      throw new NotFoundException('Document not found');
    }
    return record;
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

  /**
   * A readable 400 for backwards dates, ahead of the migration CHECK that
   * would otherwise surface as a 500. Both exist: this one is the message the
   * owner reads, the constraint is what keeps the rule true for any writer.
   */
  private assertIssueBeforeExpiry(issuedAt?: string | null, expiresAt?: string | null): void {
    if (
      typeof issuedAt === 'string' &&
      typeof expiresAt === 'string' &&
      expiresAt < issuedAt
    ) {
      throw new BadRequestException('Expiry date cannot precede the issue date');
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

  private toDate(value?: string): Date | undefined {
    return value === undefined ? undefined : new Date(`${value}T00:00:00.000Z`);
  }

  private toNullableDate(value?: string | null): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value === null ? null : new Date(`${value}T00:00:00.000Z`);
  }

  private toIsoDate(value: Date | null): string | null {
    return value === null ? null : value.toISOString().slice(0, 10);
  }
}
