import { Injectable } from '@nestjs/common';

import { CreateDocumentChunkData, ReplaceDocumentChunksParams } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * The lexical configuration `search_vector` is built with, and the one every
 * retrieval query must use — a `tsquery` parsed under a different config
 * produces lexemes that cannot match these.
 *
 * `simple` rather than `indonesian` or `english`: it neither stems nor drops
 * stopwords, which is exactly right for the terms full-text search is here to
 * catch and vectors are weak at — drug names and strengths, BPJS terminology,
 * ICD-10 and ICD-9-CM codes. A stemmer would also force one language per row
 * in a corpus that is deliberately bilingual, and `amoxicillin` stemmed under
 * `indonesian` is not a word anyone will search for.
 */
const TEXT_SEARCH_CONFIGURATION = 'simple';

/**
 * Writes and counts document chunks.
 *
 * Separate from `DocumentRepository` because it is the raw-SQL boundary:
 * Prisma can express neither `vector(1024)` nor `tsvector`, so both columns
 * are declared `Unsupported` in the schema and written through
 * `$executeRaw` here. Nothing outside this file needs to know that a vector
 * is transported as a bracketed literal.
 */
@Injectable()
export class DocumentChunkRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Replaces a document's whole chunk set and marks it ready, in one
   * transaction.
   *
   * Chunks are insert-only by design — there is no update path — so a
   * re-ingest is a delete-then-insert rather than a diff. Doing it inside a
   * transaction is what keeps the corpus consistent under a re-ingest: a
   * reader either sees the old passages or the new ones, never a document
   * halfway through being replaced, and never one with zero chunks that is
   * still marked `READY`.
   */
  async replaceDocumentChunks(params: ReplaceDocumentChunksParams): Promise<number> {
    return this.prismaService.$transaction(async (transaction) => {
      await transaction.documentChunk.deleteMany({ where: { documentId: params.documentId } });
      for (const chunk of params.chunks) {
        await transaction.$executeRaw`
          INSERT INTO "document_chunks" (
            "id", "document_id", "chunk_index", "content", "embedding", "search_vector",
            "embedding_model", "embedding_version", "visibility", "language", "created_at"
          ) VALUES (
            gen_random_uuid(),
            ${params.documentId}::uuid,
            ${chunk.chunkIndex},
            ${chunk.content},
            ${this.toVectorLiteral(chunk.embedding)}::vector,
            to_tsvector(${TEXT_SEARCH_CONFIGURATION}::regconfig, ${chunk.content}),
            ${chunk.embeddingModel},
            ${chunk.embeddingVersion},
            ${chunk.visibility}::"DocumentVisibility",
            ${chunk.language}::"DocumentLanguage",
            NOW()
          )
        `;
      }
      await transaction.document.update({
        where: { id: params.documentId },
        data: {
          ingestStatus: 'READY',
          ingestedAt: params.ingestedAt,
          ingestError: null,
        },
      });
      return params.chunks.length;
    });
  }

  async countChunks(documentId: string): Promise<number> {
    return this.prismaService.documentChunk.count({ where: { documentId } });
  }

  /**
   * pgvector's input format is a bracketed, comma-separated list. Values are
   * checked for finiteness first: `NaN` would serialize to a literal Postgres
   * rejects, and `Infinity` to one it accepts and then cannot compute a
   * distance against.
   */
  private toVectorLiteral(embedding: CreateDocumentChunkData['embedding']): string {
    if (embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Embedding vector contains a non-finite value');
    }
    return `[${embedding.join(',')}]`;
  }
}
