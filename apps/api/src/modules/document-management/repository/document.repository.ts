import { Injectable } from '@nestjs/common';

import {
  CreateDocumentData,
  CreatePatientClinicalDocumentData,
  DeleteDocumentResult,
  DocumentOwnerTypeValue,
  DocumentPage,
  DocumentRecord,
  ListDocumentsParams,
  ListPatientClinicalDocumentsParams,
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

  /**
   * Creates one patient clinical file (P16-T07). Purpose, owner type, and
   * ingest status are stated here rather than accepted: a clinical document
   * is always `PATIENT_CLINICAL`, always `PATIENT`-owned with no owning user
   * account, and never enters the ingestion queue — `NOT_APPLICABLE` is what
   * keeps `claimPendingDocuments` blind to it, with the pipeline's purpose
   * assertion and the migration CHECKs behind that.
   */
  async createPatientClinicalDocument(
    data: CreatePatientClinicalDocumentData,
  ): Promise<DocumentRecord> {
    const row = await this.prismaService.document.create({
      data: {
        ownerType: 'PATIENT',
        ownerId: null,
        purpose: 'PATIENT_CLINICAL',
        ingestStatus: 'NOT_APPLICABLE',
        visibility: 'BOTH',
        patientId: data.patientId,
        encounterId: data.encounterId,
        admissionId: data.admissionId,
        category: data.category,
        documentDate: data.documentDate,
        notes: data.notes,
        title: data.title,
        storageKey: data.storageKey,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        language: data.language,
        uploadedById: data.uploadedById,
      },
    });
    return this.toRecord(row, 0);
  }

  /**
   * Patient-scoped reads. `patientId` is a required parameter for the same
   * reason `ownerType`/`ownerId` are above: a caller cannot widen the query
   * to every patient's files by omitting an argument.
   */
  async listPatientClinicalDocuments(
    params: ListPatientClinicalDocumentsParams,
  ): Promise<DocumentPage> {
    const rows = await this.prismaService.document.findMany({
      where: {
        purpose: 'PATIENT_CLINICAL',
        patientId: params.patientId,
        category: params.category,
        encounterId: params.encounterId,
        admissionId: params.admissionId,
        deletedAt: null,
      },
      include: { _count: { select: { chunks: true } } },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined ? {} : { cursor: { id: params.cursor }, skip: 1 }),
    });
    const pageRows = rows.slice(0, params.limit);
    return {
      items: pageRows.map((row) => this.toRecord(row, row._count.chunks)),
      nextCursor: rows.length > params.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  async findPatientClinicalDocumentById(
    id: string,
    patientId: string,
  ): Promise<DocumentRecord | null> {
    const row = await this.prismaService.document.findFirst({
      where: { id, purpose: 'PATIENT_CLINICAL', patientId, deletedAt: null },
      include: { _count: { select: { chunks: true } } },
    });
    return row === null ? null : this.toRecord(row, row._count.chunks);
  }

  async findClinicalDocumentsByEncounterId(encounterId: string): Promise<DocumentRecord[]> {
    const rows = await this.prismaService.document.findMany({
      where: { purpose: 'PATIENT_CLINICAL', encounterId, deletedAt: null },
      include: { _count: { select: { chunks: true } } },
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row, row._count.chunks));
  }

  /**
   * Reads a document for the ingestion pipeline, which is deliberately
   * **owner-blind**: the worker embeds the clinic corpus and every personal
   * knowledge base with the same pipeline, and an owner filter here would
   * quietly leave one of them unindexed. Owner scoping is an access-control
   * question and belongs on the routes that answer to a user.
   */
  async findDocumentForIngestion(id: string): Promise<DocumentRecord | null> {
    const row = await this.prismaService.document.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { chunks: true } } },
    });
    return row === null ? null : this.toRecord(row, row._count.chunks);
  }

  /**
   * Claims up to `limit` pending documents by moving them to `PROCESSING` in
   * one statement per row, and returns only the rows this call actually won.
   *
   * The `ingestStatus: 'PENDING'` predicate on the update is the claim: two
   * workers racing for the same document produce one winner and one
   * zero-count update, so the loser skips it rather than embedding it twice.
   * That matters even in a single-instance deployment, because a re-ingest
   * request and a poll cycle can arrive together.
   */
  async claimPendingDocuments(limit: number): Promise<DocumentRecord[]> {
    const candidates = await this.prismaService.document.findMany({
      where: { ingestStatus: 'PENDING', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
    const claimed: DocumentRecord[] = [];
    for (const candidate of candidates) {
      const result = await this.prismaService.document.updateMany({
        where: { id: candidate.id, ingestStatus: 'PENDING', deletedAt: null },
        data: { ingestStatus: 'PROCESSING' },
      });
      if (result.count === 0) {
        continue;
      }
      const record = await this.findDocumentForIngestion(candidate.id);
      if (record !== null) {
        claimed.push(record);
      }
    }
    return claimed;
  }

  /**
   * Returns a document to the queue. Used by the re-ingest route and by a
   * worker that claimed a row it then could not process — a document left in
   * `PROCESSING` after a crash is invisible to every later poll.
   */
  async markDocumentPending(id: string): Promise<DocumentRecord> {
    const row = await this.prismaService.document.update({
      where: { id, deletedAt: null },
      data: { ingestStatus: 'PENDING', ingestError: null },
    });
    return this.toRecord(row, await this.countChunks(id));
  }

  /**
   * Records a failed attempt. The reason is stored verbatim as given by the
   * pipeline, which is why the pipeline is the layer responsible for keeping
   * file content out of it: this column is readable by anyone who can list
   * documents, and an extraction error quoting the document would be a way to
   * read a file through an error message.
   */
  async markDocumentFailed(id: string, ingestError: string): Promise<DocumentRecord> {
    const row = await this.prismaService.document.update({
      where: { id, deletedAt: null },
      data: { ingestStatus: 'FAILED', ingestError },
    });
    return this.toRecord(row, await this.countChunks(id));
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

  private async countChunks(documentId: string): Promise<number> {
    return this.prismaService.documentChunk.count({ where: { documentId } });
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
      patientId: row.patientId,
      encounterId: row.encounterId,
      admissionId: row.admissionId,
      category: row.category,
      documentDate: row.documentDate,
      notes: row.notes,
      releasedToPatient: row.releasedToPatient,
      releasedAt: row.releasedAt,
      releasedById: row.releasedById,
      deleteReason: row.deleteReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
