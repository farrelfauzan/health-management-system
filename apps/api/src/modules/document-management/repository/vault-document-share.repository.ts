import {
  SharedWithMeDocumentPage,
  UpsertVaultDocumentShareData,
  VaultDocumentShareRecipientRecord,
  VaultDocumentShareRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

/**
 * The row shape every query in this file selects, so a future column cannot
 * leak through a `select`-less read.
 */
const SHARE_SELECT = {
  id: true,
  documentId: true,
  granteeId: true,
  grantedById: true,
  expiresAt: true,
  revokedAt: true,
  lastAccessedAt: true,
  accessCount: true,
  createdAt: true,
  grantee: { select: { email: true, isActive: true, deletedAt: true } },
  grantedBy: { select: { email: true } },
} satisfies Prisma.VaultDocumentShareSelect;

type ShareRow = Prisma.VaultDocumentShareGetPayload<{ select: typeof SHARE_SELECT }>;

/**
 * Persistence for vault document sharing (`P16-T34`, §7.3.5).
 *
 * Separate from `VaultDocumentRepository` for the same reason that one is
 * separate from `DocumentRepository`: the queries here start from a *share*,
 * not from an owner, and that is the one place in this feature where a
 * document is legitimately read by someone who does not own it. Keeping those
 * reads in their own class means the owner-scoped repository never grows a
 * method that returns another person's document, and every non-owner read in
 * the system is in one file a reviewer can hold in their head.
 *
 * The live-share predicate is written out at each call site rather than
 * hidden behind a helper flag, because it is the security boundary: not
 * revoked, not past expiry, and held by an account that still exists, is
 * active, and is not offboarded (`P16-T41` — an offboarded person keeps their
 * own vault and nothing else, so keys *to* them stop turning while keys
 * *from* them keep working for their recipients, FR-E3-29).
 */
@Injectable()
export class VaultDocumentShareRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Creates the share, or revives a revoked one — the same row either way, so
   * re-sharing after a revoke does not accumulate history. `accessCount` and
   * `lastAccessedAt` reset with it: an open count that survived a revoke
   * would report opens against a key that is no longer the key being shown.
   */
  async upsertShare(data: UpsertVaultDocumentShareData): Promise<VaultDocumentShareRecord> {
    const row = await this.prismaService.vaultDocumentShare.upsert({
      where: {
        documentId_granteeId: { documentId: data.documentId, granteeId: data.granteeId },
      },
      create: {
        documentId: data.documentId,
        granteeId: data.granteeId,
        grantedById: data.grantedById,
        expiresAt: data.expiresAt,
      },
      update: {
        grantedById: data.grantedById,
        expiresAt: data.expiresAt,
        revokedAt: null,
        accessCount: 0,
        lastAccessedAt: null,
      },
      select: SHARE_SELECT,
    });
    return this.toShareRecord(row);
  }

  /**
   * Every share of one document the owner still holds, live or revoked, for
   * the owner's sharing panel.
   *
   * `ownerId` is a predicate on the joined document rather than a check after
   * the fact, so a caller who is not the owner reads an empty list rather
   * than someone else's recipients.
   */
  async listSharesForOwnedDocument(
    documentId: string,
    ownerId: string,
  ): Promise<VaultDocumentShareRecord[]> {
    const rows = await this.prismaService.vaultDocumentShare.findMany({
      where: {
        documentId,
        document: { ownerId, purpose: 'DOCTOR_VAULT', deletedAt: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: SHARE_SELECT,
    });
    return rows.map((row) => this.toShareRecord(row));
  }

  /** One share of a document this caller owns, or null. */
  async findShareForOwnedDocument(
    shareId: string,
    documentId: string,
    ownerId: string,
  ): Promise<VaultDocumentShareRecord | null> {
    const row = await this.prismaService.vaultDocumentShare.findFirst({
      where: {
        id: shareId,
        documentId,
        document: { ownerId, purpose: 'DOCTOR_VAULT', deletedAt: null },
      },
      select: SHARE_SELECT,
    });
    return row === null ? null : this.toShareRecord(row);
  }

  /**
   * Stamps a share revoked. Idempotent by `revokedAt: null` in the filter:
   * revoking twice is not an error, and the second call must not move the
   * recorded time — when a key stopped working is a fact, not a last-write.
   */
  async revokeShare(shareId: string): Promise<Date | null> {
    const revokedAt = new Date();
    const result = await this.prismaService.vaultDocumentShare.updateMany({
      where: { id: shareId, revokedAt: null },
      data: { revokedAt },
    });
    if (result.count > 0) {
      return revokedAt;
    }
    const existing = await this.prismaService.vaultDocumentShare.findUnique({
      where: { id: shareId },
      select: { revokedAt: true },
    });
    return existing?.revokedAt ?? null;
  }

  /**
   * The documents this caller may open through a live share, newest key
   * first.
   *
   * Every clause of the live-share predicate is here, evaluated per request
   * and never cached (FR-E3-15). A share revoked a second ago stops resolving
   * on the very next call — there is no window in which a recipient still
   * reads a document because a cache had not caught up.
   */
  async listSharedWithMe(params: {
    granteeId: string;
    now: Date;
    cursor?: string;
    limit: number;
  }): Promise<SharedWithMeDocumentPage> {
    const rows = await this.prismaService.vaultDocumentShare.findMany({
      where: {
        granteeId: params.granteeId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: params.now } }],
        grantee: { isActive: true, deletedAt: null, offboardedAt: null },
        document: { purpose: 'DOCTOR_VAULT', deletedAt: null },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined ? {} : { cursor: { id: params.cursor }, skip: 1 }),
      select: {
        id: true,
        documentId: true,
        expiresAt: true,
        createdAt: true,
        grantedBy: { select: { email: true } },
        document: {
          select: { title: true, mimeType: true, sizeBytes: true, storageKey: true },
        },
      },
    });
    const pageRows = rows.slice(0, params.limit);
    return {
      items: pageRows.map((row) => ({
        shareId: row.id,
        documentId: row.documentId,
        title: row.document.title,
        mimeType: row.document.mimeType,
        sizeBytes: row.document.sizeBytes,
        storageKey: row.document.storageKey,
        sharedByEmail: row.grantedBy.email,
        sharedAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
      nextCursor: rows.length > params.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * The one document this caller may open by id through a live share, or
   * null.
   *
   * Repeats the whole live-share predicate rather than loading the share and
   * testing it in the service. A row that fails any clause is never returned,
   * so there is no moment where a service holds a document it must remember
   * to refuse — which is the mistake that would hand a revoked recipient a
   * signed URL.
   */
  async findSharedWithMeDocument(params: {
    documentId: string;
    granteeId: string;
    now: Date;
  }): Promise<{ share: VaultDocumentShareRecord; storageKey: string; title: string } | null> {
    const row = await this.prismaService.vaultDocumentShare.findFirst({
      where: {
        documentId: params.documentId,
        granteeId: params.granteeId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: params.now } }],
        grantee: { isActive: true, deletedAt: null, offboardedAt: null },
        document: { purpose: 'DOCTOR_VAULT', deletedAt: null },
      },
      select: {
        ...SHARE_SELECT,
        document: { select: { storageKey: true, title: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      share: this.toShareRecord(row),
      storageKey: row.document.storageKey,
      title: row.document.title,
    };
  }

  /**
   * Records that a recipient opened a shared document, and reports whether
   * this was their first time — which is what the owner is notified about
   * (FR-E3-19).
   *
   * The increment is `{ increment: 1 }` rather than a read-modify-write, so
   * two concurrent opens count as two.
   */
  async recordSharedAccess(shareId: string, accessedAt: Date): Promise<{ isFirstAccess: boolean }> {
    const updated = await this.prismaService.vaultDocumentShare.update({
      where: { id: shareId },
      data: { accessCount: { increment: 1 }, lastAccessedAt: accessedAt },
      select: { accessCount: true },
    });
    return { isFirstAccess: updated.accessCount === 1 };
  }

  /**
   * Accounts the caller could hand a document to: live human accounts that
   * hold `vault-document.read:own`, matched on their sign-in address.
   *
   * Scoped to people who could actually open a shared vault document rather
   * than to all users, so it is a recipient lookup and not a staff directory
   * handed to a role that holds no `user.read:any`. The caller and service
   * accounts are excluded — a share to yourself is meaningless, and nothing
   * reads a vault on a machine account's behalf.
   */
  async listShareRecipients(params: {
    search: string;
    excludeUserId: string;
    limit: number;
  }): Promise<VaultDocumentShareRecipientRecord[]> {
    const rows = await this.prismaService.user.findMany({
      where: {
        id: { not: params.excludeUserId },
        isActive: true,
        isSystem: false,
        deletedAt: null,
        email: { contains: params.search, mode: 'insensitive' },
        roles: {
          some: {
            deletedAt: null,
            unassignedAt: null,
            role: {
              permissions: {
                some: { permission: { permissionKey: 'vault-document.read:own' } },
              },
            },
          },
        },
      },
      orderBy: { email: 'asc' },
      take: params.limit,
      select: {
        id: true,
        email: true,
        roles: {
          where: { deletedAt: null, unassignedAt: null },
          select: { role: { select: { code: true } } },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      roleCodes: row.roles.map((userRole) => userRole.role.code),
    }));
  }

  /**
   * Whether this account could open a shared vault document at all: live,
   * human, and holding `vault-document.read:own`.
   *
   * Checked before a share is written rather than only when it is used. A row
   * granting access to somebody who can never open it is not harmless — it
   * appears in the owner's panel as a key they believe they handed over, and
   * an owner who thinks a colleague has their STR is an owner who does not
   * send it again.
   */
  async isEligibleRecipient(userId: string): Promise<boolean> {
    const row = await this.prismaService.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        isSystem: false,
        deletedAt: null,
        // An offboarded person's one remaining capability is their own vault
        // (P16-T41); a key to somebody else's document is not part of it.
        offboardedAt: null,
        roles: {
          some: {
            deletedAt: null,
            unassignedAt: null,
            role: {
              permissions: {
                some: { permission: { permissionKey: 'vault-document.read:own' } },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return row !== null;
  }

  private toShareRecord(row: ShareRow): VaultDocumentShareRecord {
    return {
      id: row.id,
      documentId: row.documentId,
      granteeId: row.granteeId,
      granteeEmail: row.grantee.email,
      isGranteeActive: row.grantee.isActive && row.grantee.deletedAt === null,
      grantedById: row.grantedById,
      grantedByEmail: row.grantedBy.email,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastAccessedAt: row.lastAccessedAt,
      accessCount: row.accessCount,
      createdAt: row.createdAt,
    };
  }
}
