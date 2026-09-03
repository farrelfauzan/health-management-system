import { Injectable } from '@nestjs/common';

import {
  CreateVaultDocumentData,
  DeleteVaultDocumentResult,
  DocumentPage,
  DocumentRecord,
  ListVaultDocumentsParams,
  UpdateVaultDocumentData,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Document } from '../../../generated/prisma/client';
import { toDocumentRecord } from './to-document-record';

/**
 * Persistence for the doctor vault (`P16-T16`).
 *
 * Separate from `DocumentRepository` on purpose rather than a few more
 * methods on it. Every query here carries `ownerId` **and**
 * `purpose: 'DOCTOR_VAULT'` as a predicate — ownership is part of the
 * question asked of the database, never a filter applied to rows it already
 * returned — and keeping that in its own class is what stops a vault read
 * from ever being one forgotten argument away from a knowledge-base read.
 * The two surfaces share a table and nothing else: a knowledge-base document
 * is chunked and its passages reach the AI provider, a vault document is
 * stored, served to its owner, and reaches no vendor at all.
 */
@Injectable()
export class VaultDocumentRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Creates one vault document. Purpose and ingest status are stated here
   * rather than accepted: a vault document is always `DOCTOR_VAULT` and its
   * resting `NOT_APPLICABLE` is what keeps `claimPendingDocuments` blind to
   * it, with `INGESTIBLE_DOCUMENT_PURPOSES` and the migration CHECKs behind
   * that.
   */
  async createVaultDocument(data: CreateVaultDocumentData): Promise<DocumentRecord> {
    const row = await this.prismaService.document.create({
      data: {
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        purpose: 'DOCTOR_VAULT',
        ingestStatus: 'NOT_APPLICABLE',
        visibility: 'BOTH',
        title: data.title,
        storageKey: data.storageKey,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        language: data.language,
        vaultCategory: data.vaultCategory,
        referenceNumber: data.referenceNumber,
        issuedAt: data.issuedAt,
        expiresAt: data.expiresAt,
        uploadedById: data.uploadedById,
      },
    });
    return toDocumentRecord(row, 0);
  }

  async listVaultDocuments(params: ListVaultDocumentsParams): Promise<DocumentPage> {
    const rows = await this.prismaService.document.findMany({
      where: {
        purpose: 'DOCTOR_VAULT',
        ownerId: params.ownerId,
        vaultCategory: params.vaultCategory,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined ? {} : { cursor: { id: params.cursor }, skip: 1 }),
    });
    const pageRows = rows.slice(0, params.limit);
    return {
      items: pageRows.map((row) => toDocumentRecord(row, 0)),
      nextCursor: rows.length > params.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * Reads one document *of this owner's*. The owner is in the `where`, not
   * checked afterwards, so a foreign id and a missing id are indistinguishable
   * from here — which is what lets the service answer 404 for both without
   * confirming that someone else's document exists (FR-E3-02).
   */
  async findVaultDocumentById(id: string, ownerId: string): Promise<DocumentRecord | null> {
    const row = await this.prismaService.document.findFirst({
      where: { id, ownerId, purpose: 'DOCTOR_VAULT', deletedAt: null },
    });
    return row === null ? null : toDocumentRecord(row, 0);
  }

  async updateVaultDocument(
    id: string,
    ownerId: string,
    data: UpdateVaultDocumentData,
  ): Promise<DocumentRecord | null> {
    const updated = await this.prismaService.document.updateMany({
      where: { id, ownerId, purpose: 'DOCTOR_VAULT', deletedAt: null },
      data,
    });
    return updated.count === 0 ? null : this.findVaultDocumentById(id, ownerId);
  }

  /**
   * **Hard**-deletes the row (FR-E3-09). Unlike a clinical file, a doctor's
   * own paperwork falls under no retention floor: the 25-year RME rule is
   * about a patient's medical record, and applying it to someone's KTP would
   * mean the product refusing to forget a person's identity documents on
   * request. Expiry notices cascade; the caller deletes the stored object
   * using the returned key.
   */
  async deleteVaultDocument(id: string, ownerId: string): Promise<DeleteVaultDocumentResult | null> {
    return this.prismaService.$transaction(async (transaction) => {
      const row = await transaction.document.findFirst({
        where: { id, ownerId, purpose: 'DOCTOR_VAULT', deletedAt: null },
        select: { id: true, storageKey: true },
      });
      if (row === null) {
        return null;
      }
      await transaction.document.delete({ where: { id: row.id } });
      return { id: row.id, storageKey: row.storageKey };
    });
  }

  /**
   * Whether this document has already been announced at this threshold. The
   * reminder job (`P16-T18`) is expected to run more than once over the same
   * window — retries, overlapping schedules, a redeploy mid-run — and a
   * doctor being told twice that their STR expires is the failure this table
   * exists to prevent.
   *
   * Kept alongside {@link claimExpiryNotice} for readers and tests. The job
   * itself does not call it: a read followed by a write is two statements a
   * second worker can interleave, and the unique index is the thing that
   * actually decides.
   */
  async hasExpiryNotice(documentId: string, thresholdDays: number): Promise<boolean> {
    const notice = await this.prismaService.vaultDocumentExpiryNotice.findUnique({
      where: { documentId_thresholdDays: { documentId, thresholdDays } },
      select: { id: true },
    });
    return notice !== null;
  }

  /**
   * Records the announcement and reports whether **this call** was the one
   * that made it, so the caller notifies exactly once.
   *
   * `createMany` with `skipDuplicates` rather than a create: two workers
   * reaching the same row together must produce one notice and no error, and
   * the unique index is what decides — not a preceding read, which a
   * concurrent worker can slip between.
   */
  async claimExpiryNotice(documentId: string, thresholdDays: number): Promise<boolean> {
    const result = await this.prismaService.vaultDocumentExpiryNotice.createMany({
      data: [{ documentId, thresholdDays }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }

  /**
   * Vault documents expiring on or before `throughDate`, for the reminder
   * job. Spans owners by necessity — it is the one query in this feature that
   * does — and returns only rows that carry an expiry, so a document nobody
   * dated is never the subject of a reminder.
   */
  async listExpiringVaultDocuments(throughDate: Date): Promise<Document[]> {
    return this.prismaService.document.findMany({
      where: {
        purpose: 'DOCTOR_VAULT',
        expiresAt: { not: null, lte: throughDate },
        deletedAt: null,
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
  }
}
