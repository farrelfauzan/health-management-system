import { OffboardingVaultSummary } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { AuditAction } from '../../../generated/prisma/client';
import { VaultDocumentRepository } from '../repository/vault-document.repository';

const VAULT_DOCUMENT_AUDIT_RESOURCE = 'vault-document';

/**
 * The vault's side of offboarding (`P16-T41`, §7.3.10): what a leaving
 * person's drawer holds, and the end-of-window purge.
 *
 * Exported from this module so `admin-management` — which owns the
 * offboarding action and its sweep — never reaches into a vault repository
 * across the module boundary. The rule it enforces is the product owner's
 * three-part one: **shared documents survive** for the people they were
 * shared with, **unshared documents are hard-deleted** with their objects
 * once the window closes, and the deletion is audited with a count
 * (FR-E3-28/29).
 *
 * "Shared" is decided by the same live-share predicate a recipient's read
 * resolves through, evaluated at the moment of the purge — so a share the
 * owner revoked on their way out takes its document with it, and a share
 * that expires next month does not keep a document alive today.
 */
@Injectable()
export class VaultOffboardingService {
  private readonly logger = new Logger(VaultOffboardingService.name);

  constructor(
    private readonly vaultDocumentRepository: VaultDocumentRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly auditService: AuditService,
  ) {}

  /** The preview a super admin confirms against (FR-E3-31). */
  async summariseVault(ownerId: string, now: Date): Promise<OffboardingVaultSummary> {
    return this.vaultDocumentRepository.countVaultDocumentsByShareState(ownerId, now);
  }

  /**
   * Hard-deletes every unshared vault document this person still holds and
   * returns how many left. Rows first, then objects: a failure to remove an
   * object leaves an orphan in the bucket rather than a document the system
   * has promised is gone, which is the better of the two failures — the same
   * order the owner's own delete uses.
   */
  async purgeUnsharedDocuments(ownerId: string, now: Date): Promise<number> {
    const documents = await this.vaultDocumentRepository.listUnsharedVaultDocuments(ownerId, now);
    const deletedCount = await this.vaultDocumentRepository.deleteVaultDocumentsByIds(
      ownerId,
      documents.map((document) => document.id),
    );
    for (const document of documents) {
      await this.deleteStoredObject(document.storageKey);
    }
    // One row with a count, never one per document: the documents are gone,
    // and a list of their titles in the audit log would outlive the privacy
    // they had. No actor — the clinic's clock did this, not a person.
    await this.auditService.recordOrThrow({
      action: AuditAction.USER_OFFBOARDING_VAULT_PURGED,
      resource: VAULT_DOCUMENT_AUDIT_RESOURCE,
      actorUserId: null,
      resourceId: ownerId,
      metadata: { deletedCount },
    });
    return deletedCount;
  }

  private async deleteStoredObject(storageKey: string): Promise<void> {
    try {
      await this.objectStorageService.deleteObject({ key: storageKey });
    } catch {
      // Logged without the key: a storage key names the owner's vault prefix.
      this.logger.warn(buildSafeErrorLog('vault_offboarding_object_delete_failed'));
    }
  }
}
