import { Injectable } from '@nestjs/common';

import {
  CreateDocumentData,
  DeleteDocumentResult,
  DocumentOwnerTypeValue,
  DocumentPage,
  DocumentRecord,
  ListDocumentsParams,
  UpdateDocumentData,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Document } from '../../../generated/prisma/client';

/**
 * Persistence for the shared document store. Every read is owner-scoped by
 * construction: `ownerType` **and** `ownerId` are required parameters rather
 * than optional filters, so a caller cannot accidentally widen a query from
 * one doctor's knowledge base to every document in the clinic by omitting an
 * argument — the personal corpora of `P15-T20` come through this same
 * repository (ai-chatbot-tools.md §5.5).
 *
 * `DocumentChunk` carries `Unsupported` vector and tsvector columns, so this
 * repository never selects a chunk row; it only counts and deletes them,
 * which Prisma Client handles without touching those columns. Chunk *writes*
 * belong to the ingestion pipeline and are raw SQL by necessity.
 */
@Injectable()
export class DocumentRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createDocument(data: CreateDocumentData): Promise<DocumentRecord> {
    const row = await this.prismaService.document.create({
      data: {
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        purpose: data.purpose,
        title: data.title,
        storageKey: data.storageKey,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        visibility: data.visibility,
        language: data.language,
        ingestStatus: data.ingestStatus,
        uploadedById: data.uploadedById,
      },
    });
    return this.toRecord(row, 0);
  }

  async findDocumentById(
    id: string,
    ownerType: DocumentOwnerTypeValue,
    ownerId: string | null,
  ): Promise<DocumentRecord | null> {
    const row = await this.prismaService.document.findFirst({
      where: { id, ownerType, ownerId, deletedAt: null },
      include: { _count: { select: { chunks: true } } },
    });
    return row === null ? null : this.toRecord(row, row._count.chunks);
  }

  async listDocuments(params: ListDocumentsParams): Promise<DocumentPage> {
    const rows = await this.prismaService.document.findMany({
      where: {
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        purpose: params.purpose,
        ingestStatus: params.ingestStatus,
        visibility: params.visibility,
        language: params.language,
        deletedAt: null,
      },
      include: { _count: { select: { chunks: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined ? {} : { cursor: { id: params.cursor }, skip: 1 }),
    });
    const pageRows = rows.slice(0, params.limit);
    return {
      items: pageRows.map((row) => this.toRecord(row, row._count.chunks)),
      nextCursor: rows.length > params.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * Applies a metadata edit and, when the edit changes what retrieval may
   * return, discards the chunks in the same transaction.
   *
   * Chunks carry copies of `visibility` and `language` so the retrieval query
   * filters in one pass over that table. Leaving the copies behind after the
   * parent changes would keep a document answering under its old visibility —
   * a staff-only SOP demoted from `BOTH` would still surface in a patient
   * answer until someone remembered to re-ingest. Discarding is fails-closed:
   * a document temporarily unsearchable is a smaller fault than one searchable
   * by the wrong audience.
   */
  async updateDocument(
    id: string,
    data: UpdateDocumentData,
    shouldDiscardChunks: boolean,
  ): Promise<DocumentRecord> {
    const { row, chunkCount } = await this.prismaService.$transaction(async (transaction) => {
      if (shouldDiscardChunks) {
        await transaction.documentChunk.deleteMany({ where: { documentId: id } });
      }
      const updated = await transaction.document.update({
        where: { id, deletedAt: null },
        data: {
          title: data.title,
          visibility: data.visibility,
          language: data.language,
          ingestStatus: data.ingestStatus,
          ...(shouldDiscardChunks ? { ingestedAt: null, ingestError: null } : {}),
        },
      });
      const remaining = shouldDiscardChunks
        ? 0
        : await transaction.documentChunk.count({ where: { documentId: id } });
      return { row: updated, chunkCount: remaining };
    });
    return this.toRecord(row, chunkCount);
  }

  /**
   * Soft-deletes the document and **hard-deletes its chunks** in one
   * transaction. Retrieval queries `document_chunks` directly rather than
   * joining the parent for every candidate, so a soft delete alone would
   * retire the row while leaving the document answering questions.
   *
   * The stored object survives: the bucket is private, every download is a
   * signed URL minted against a live row, and a soft delete that destroyed
   * the file would not be reversible in the way the rest of the repo's soft
   * deletes are.
   */
  async softDeleteDocument(id: string): Promise<DeleteDocumentResult> {
    const deletedAt = new Date();
    return this.prismaService.$transaction(async (transaction) => {
      const removed = await transaction.documentChunk.deleteMany({ where: { documentId: id } });
      const row = await transaction.document.update({
        where: { id, deletedAt: null },
        data: { deletedAt },
      });
      return { document: this.toRecord(row, 0), deletedAt, chunksRemoved: removed.count };
    });
  }

  private toRecord(row: Document, chunkCount: number): DocumentRecord {
    return {
      id: row.id,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      purpose: row.purpose,
      title: row.title,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      visibility: row.visibility,
      language: row.language,
      ingestStatus: row.ingestStatus,
      ingestError: row.ingestError,
      ingestedAt: row.ingestedAt,
      chunkCount,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
