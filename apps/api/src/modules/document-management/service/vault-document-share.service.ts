import {
  CreateVaultDocumentShareInput,
  ListSharedWithMeDocumentsQueryInput,
  ListVaultDocumentShareRecipientsQueryInput,
  RevokedVaultDocumentShareView,
  SharedWithMeDocumentListView,
  VAULT_DOCUMENT_SHARE_RECIPIENT_LIMIT,
  VaultDocumentDownloadView,
  VaultDocumentShareListView,
  VaultDocumentShareRecipientListView,
  VaultDocumentShareRecord,
  VaultDocumentShareView,
} from '@hms/shared-types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { NotificationService } from '../../notification/service/notification.service';
import { VaultDocumentShareRepository } from '../repository/vault-document-share.repository';
import { VaultDocumentRepository } from '../repository/vault-document.repository';
import { VAULT_DOCUMENT_AUDIT_RESOURCE } from './vault-document.service';
import { VaultDocumentAccessService } from './vault-document-access.service';

const SHARED_WITH_ME_HREF = '/vault/shared-with-me';

/**
 * Handing one vault document to one named person, and taking it back
 * (`P16-T34`, §7.3.5).
 *
 * The thing is private until its owner hands someone a key; the key is to one
 * thing and one person; the owner can take it back and see who used it.
 *
 * **A share needs no new read permission and no new scope.** `OWN` in this
 * system has never meant strict ownership — it means a relationship the
 * server can prove, the way a `DoctorPatient` assignment is what makes
 * `encounter.read:own` resolve for a clinician who did not create the
 * encounter. An owner-created, revocable share is exactly such a
 * relationship, so `vault-document.read:own` resolves here to *owned by me,
 * or shared with me by its owner and still live*. `vault-document.read:any`
 * still does not exist: nobody can browse a vault, they can only open what
 * they were handed.
 *
 * Every share write re-checks that the actor owns the document. A share
 * created by anyone else is the one bug that would undo this epic, so the
 * check is not a guard clause the reader has to find — the owner lookup is
 * the first statement of every write path here, and the repository behind it
 * carries `ownerId` as a predicate rather than a filter.
 */
@Injectable()
export class VaultDocumentShareService {
  private readonly logger = new Logger(VaultDocumentShareService.name);

  constructor(
    private readonly vaultDocumentShareRepository: VaultDocumentShareRepository,
    private readonly vaultDocumentRepository: VaultDocumentRepository,
    private readonly vaultDocumentAccessService: VaultDocumentAccessService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Grants one person access to one of the caller's own documents
   * (FR-E3-13).
   *
   * Owner-initiated and nothing else: there is no request-access flow, no
   * approval queue, and no route by which a person who wants a document can
   * start this. The only way a key exists is that its owner made one.
   */
  async createShare(
    documentId: string,
    input: CreateVaultDocumentShareInput,
    actor: CurrentUser,
  ): Promise<VaultDocumentShareView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'share');
    const document = await this.requireOwnedDocument(documentId, actor.sub);
    if (input.granteeId === actor.sub) {
      throw new BadRequestException('You already have access to your own document');
    }
    const expiresAt = input.expiresAt === undefined ? null : new Date(input.expiresAt);
    if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Share expiry must be in the future');
    }
    // A key to somebody who can never turn it is worse than no key: it shows
    // in the owner's panel as access they believe they granted, and an owner
    // who thinks a colleague already has their STR does not send it again.
    // The same 404-not-403 rule as everywhere in this surface — a share
    // attempt must not become a way to probe which user ids exist.
    const isEligible = await this.vaultDocumentShareRepository.isEligibleRecipient(
      input.granteeId,
    );
    if (!isEligible) {
      throw new NotFoundException('No such recipient');
    }
    const share = await this.vaultDocumentShareRepository.upsertShare({
      documentId: document.id,
      granteeId: input.granteeId,
      grantedById: actor.sub,
      expiresAt,
    });
    await this.auditService.recordOrThrow({
      action: AuditAction.VAULT_DOCUMENT_SHARE_GRANTED,
      resource: VAULT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: document.id,
      metadata: {
        shareId: share.id,
        ownerId: actor.sub,
        granteeId: share.granteeId,
        expiresAt: expiresAt === null ? null : expiresAt.toISOString(),
      },
    });
    await this.notifyRecipientOfShare(share, document.title);
    return this.toShareView(share);
  }

  /** Every key to one of the caller's own documents (FR-E3-16). */
  async listSharesForDocument(
    documentId: string,
    actor: CurrentUser,
  ): Promise<VaultDocumentShareListView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'share');
    await this.requireOwnedDocument(documentId, actor.sub);
    const shares = await this.vaultDocumentShareRepository.listSharesForOwnedDocument(
      documentId,
      actor.sub,
    );
    return { items: shares.map((share) => this.toShareView(share)) };
  }

  /**
   * Takes one key back (FR-E3-15).
   *
   * Effective on the recipient's next request, because the live-share
   * predicate is evaluated per request and nothing is cached. It stops every
   * future fetch; it does not recall a copy already downloaded, and the share
   * dialog says so before the share is created rather than after.
   */
  async revokeShare(
    documentId: string,
    shareId: string,
    actor: CurrentUser,
  ): Promise<RevokedVaultDocumentShareView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'share');
    await this.requireOwnedDocument(documentId, actor.sub);
    const share = await this.vaultDocumentShareRepository.findShareForOwnedDocument(
      shareId,
      documentId,
      actor.sub,
    );
    if (share === null) {
      throw new NotFoundException('Share not found');
    }
    const revokedAt = await this.vaultDocumentShareRepository.revokeShare(share.id);
    if (revokedAt === null) {
      throw new NotFoundException('Share not found');
    }
    await this.auditService.recordOrThrow({
      action: AuditAction.VAULT_DOCUMENT_SHARE_REVOKED,
      resource: VAULT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: documentId,
      metadata: { shareId: share.id, ownerId: actor.sub, granteeId: share.granteeId },
    });
    return { id: share.id, revokedAt: revokedAt.toISOString() };
  }

  /**
   * What has been shared with the caller (FR-E3-17).
   *
   * Only the individual documents handed to them. Nothing here is a view onto
   * anyone's vault, and nothing reveals what else that vault holds — a
   * recipient who was given one file learns that one file exists.
   */
  async listSharedWithMe(
    query: ListSharedWithMeDocumentsQueryInput,
    actor: CurrentUser,
  ): Promise<SharedWithMeDocumentListView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'read');
    const page = await this.vaultDocumentShareRepository.listSharedWithMe({
      granteeId: actor.sub,
      now: new Date(),
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      items: page.items.map((record) => ({
        id: record.documentId,
        title: record.title,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        sharedByEmail: record.sharedByEmail,
        sharedAt: record.sharedAt.toISOString(),
        expiresAt: record.expiresAt === null ? null : record.expiresAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Mints a download URL for a document shared with the caller, records the
   * access, and tells the owner the first time (FR-E3-14, FR-E3-19).
   *
   * View and download is the whole of a recipient's capability. There is no
   * PATCH, no DELETE and no re-share route that resolves for a shared
   * document — not because those routes check ownership and refuse, but
   * because they are owner-scoped routes on a different controller and a
   * shared document is not in the set they query.
   */
  async getSharedDownloadUrl(
    documentId: string,
    actor: CurrentUser,
  ): Promise<VaultDocumentDownloadView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'read');
    const shared = await this.vaultDocumentShareRepository.findSharedWithMeDocument({
      documentId,
      granteeId: actor.sub,
      now: new Date(),
    });
    if (shared === null) {
      throw new NotFoundException('Document not found');
    }
    const signedUrl = await this.objectStorageService.getSignedUrl({
      key: shared.storageKey,
      responseContentDisposition: `attachment; filename="${encodeURIComponent(shared.title)}"`,
    });
    // Recorded before the URL is returned, and `recordOrThrow`: a shared
    // read that left no trace is one the owner cannot discover, and the
    // owner's ability to see the door being used is the whole basis on which
    // they opened it.
    await this.auditService.recordOrThrow({
      action: AuditAction.VAULT_DOCUMENT_SHARED_ACCESS,
      resource: VAULT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      resourceId: documentId,
      metadata: {
        shareId: shared.share.id,
        ownerId: shared.share.grantedById,
        granteeId: actor.sub,
      },
    });
    const { isFirstAccess } = await this.vaultDocumentShareRepository.recordSharedAccess(
      shared.share.id,
      new Date(),
    );
    if (isFirstAccess) {
      await this.notifyOwnerOfFirstOpen(shared.share, shared.title);
    }
    return { url: signedUrl.url, expiresAt: signedUrl.expiresAt };
  }

  /** People the caller could hand a document to (`P16-T34`). */
  async listShareRecipients(
    query: ListVaultDocumentShareRecipientsQueryInput,
    actor: CurrentUser,
  ): Promise<VaultDocumentShareRecipientListView> {
    await this.vaultDocumentAccessService.resolveVaultOwnerType(actor, 'share');
    const recipients = await this.vaultDocumentShareRepository.listShareRecipients({
      search: query.search,
      excludeUserId: actor.sub,
      limit: VAULT_DOCUMENT_SHARE_RECIPIENT_LIMIT,
    });
    return { items: recipients };
  }

  /**
   * Loads a document this caller owns, or reports it missing.
   *
   * The purpose predicate in the repository is what keeps a knowledge-base
   * document out of the sharing engine: it is the reason a CHECK constraint
   * on `vault_document_shares` was not needed for the same rule.
   */
  private async requireOwnedDocument(documentId: string, ownerId: string) {
    const document = await this.vaultDocumentRepository.findVaultDocumentById(documentId, ownerId);
    if (document === null) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  /**
   * Best-effort, like every notification producer here: a failed bell must
   * never fail the share it announces. The recipient still has the key, and
   * it still shows in their list.
   */
  private async notifyRecipientOfShare(
    share: VaultDocumentShareRecord,
    documentTitle: string,
  ): Promise<void> {
    try {
      await this.notificationService.createForUser({
        userId: share.granteeId,
        type: 'VAULT_DOCUMENT_SHARED',
        titleKey: 'vaultDocumentShared.title',
        bodyKey: 'vaultDocumentShared.body',
        params: { documentTitle, sharedByEmail: share.grantedByEmail },
        href: SHARED_WITH_ME_HREF,
      });
    } catch (caughtError) {
      this.logger.warn(
        `Share notification failed for share ${share.id}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
    }
  }

  private async notifyOwnerOfFirstOpen(
    share: VaultDocumentShareRecord,
    documentTitle: string,
  ): Promise<void> {
    try {
      await this.notificationService.createForUser({
        userId: share.grantedById,
        type: 'VAULT_DOCUMENT_OPENED',
        titleKey: 'vaultDocumentOpened.title',
        bodyKey: 'vaultDocumentOpened.body',
        params: { documentTitle, granteeEmail: share.granteeEmail },
        href: '/vault',
      });
    } catch (caughtError) {
      this.logger.warn(
        `First-open notification failed for share ${share.id}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
    }
  }

  /**
   * `isLive` is computed here rather than stored, from the same three clauses
   * the repository puts in its `where`. Two copies of one rule is a risk; the
   * alternative — a stored flag a revoke has to remember to clear — is a
   * worse one, because it fails open.
   */
  private toShareView(share: VaultDocumentShareRecord): VaultDocumentShareView {
    const isLive =
      share.revokedAt === null &&
      (share.expiresAt === null || share.expiresAt.getTime() > Date.now()) &&
      share.isGranteeActive;
    return {
      id: share.id,
      documentId: share.documentId,
      granteeId: share.granteeId,
      granteeEmail: share.granteeEmail,
      expiresAt: share.expiresAt === null ? null : share.expiresAt.toISOString(),
      revokedAt: share.revokedAt === null ? null : share.revokedAt.toISOString(),
      lastAccessedAt: share.lastAccessedAt === null ? null : share.lastAccessedAt.toISOString(),
      openCount: share.accessCount,
      createdAt: share.createdAt.toISOString(),
      isLive,
    };
  }
}
