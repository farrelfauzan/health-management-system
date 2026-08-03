import { Injectable } from '@nestjs/common';

import {
  DocumentLanguageValue,
  RankedDocumentChunkCandidate,
  RetrievalSourceTierValue,
  RetrieveDocumentChunksParams,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { INDONESIAN_QUERY_STOPWORDS } from './indonesian-query-stopwords';

/**
 * The lexical configuration every retrieval query must parse its `tsquery`
 * under. It has to be the one `DocumentChunkRepository` built `search_vector`
 * with: lexemes produced under a different configuration cannot match those,
 * and the failure is silent — the query simply returns nothing.
 */
const TEXT_SEARCH_CONFIGURATION = 'simple';

/** The raw shape both halves select, before the rank is attached. */
type RetrievalRow = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  chunk_index: number;
  content: string;
  language: DocumentLanguageValue;
  owner_type: string;
};

/**
 * The read half of hybrid retrieval (ai-chatbot-tools.md §5.3): one vector
 * query, one full-text query, both over the same candidate set, fused by the
 * caller.
 *
 * **The scope predicate is the security boundary and it is written once.**
 * Both halves call {@link buildScopePredicate}, so there is no way for the
 * lexical query to see a document the vector query could not — a divergence
 * that would be invisible in every test that only checked the ranked output.
 * The predicate is the union §5.5 names and nothing else: the clinic corpus
 * filtered by the asking channel's visibility, plus the asking user's own
 * knowledge base. Another doctor's document is not outranked, it is not a
 * candidate.
 *
 * Raw SQL by necessity rather than by preference: `embedding` and
 * `search_vector` are `Unsupported` columns Prisma Client cannot select, let
 * alone order by, so `<=>` and `@@` are only reachable from here.
 */
@Injectable()
export class DocumentRetrievalRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * The semantic half. Cosine distance (`<=>`) against the question's vector,
   * restricted to chunks written by the *current* embedding model and
   * version: a chunk left behind by an earlier model is in a different vector
   * space, and Postgres would happily compute a distance against it and
   * return a confident, meaningless number. Excluding it is why those two
   * columns exist (§5.4).
   *
   * There is no HNSW index — deliberately, see `20260818000000_document_store`
   * — so this is an exact scan over the candidate set. At clinic corpus size
   * that is milliseconds and perfect recall, which is the right trade while
   * `P15-T12` is establishing the baseline everything else is measured
   * against.
   */
  async searchByVector(
    params: RetrieveDocumentChunksParams,
  ): Promise<RankedDocumentChunkCandidate[]> {
    const vectorLiteral = this.toVectorLiteral(params.queryEmbedding);
    const rows = await this.prismaService.$queryRaw<RetrievalRow[]>`
      SELECT c."id" AS chunk_id,
             c."document_id" AS document_id,
             d."title" AS document_title,
             c."chunk_index" AS chunk_index,
             c."content" AS content,
             c."language" AS language,
             d."owner_type"::text AS owner_type
      FROM "document_chunks" c
      JOIN "documents" d ON d."id" = c."document_id"
      WHERE c."embedding" IS NOT NULL
        AND c."embedding_model" = ${params.embeddingModel}
        AND c."embedding_version" = ${params.embeddingVersion}
        AND d."deleted_at" IS NULL
        AND (
          (
            d."owner_type"::text = 'CLINIC'
            AND d."purpose"::text = 'FAQ_KNOWLEDGE_BASE'
            AND c."visibility"::text IN (${params.channelVisibility}, 'BOTH')
          )
          OR (
            ${params.ownerUserId}::uuid IS NOT NULL
            AND d."owner_id" = ${params.ownerUserId}::uuid
            AND d."owner_type"::text IN ('DOCTOR', 'ADMIN')
            AND d."purpose"::text = 'PERSONAL_KNOWLEDGE_BASE'
          )
        )
      ORDER BY c."embedding" <=> ${vectorLiteral}::vector ASC, c."id" ASC
      LIMIT ${params.candidateLimit}
    `;
    return this.toRankedCandidates(rows);
  }

  /**
   * The lexical half, and the reason this is hybrid rather than vector-only:
   * embeddings return a semantically adjacent antibiotic when asked about
   * "Amoxicillin 500mg", and exact terms — drug names and strengths, BPJS
   * terminology, ICD-10 and ICD-9-CM codes — are precisely what this clinic's
   * users type (§5.3).
   *
   * **The query is an OR of the question's lexemes, and it has to be.** Every
   * builder Postgres ships for untrusted text — `plainto_tsquery`,
   * `phraseto_tsquery`, `websearch_to_tsquery` — combines terms with AND, and
   * the input here is a chat message, not a search box: "do we have
   * amoxicillin 500mg in stock?" would require a chunk containing *do*, *we*,
   * *have*, *in* and *stock* as well, and `search_vector` is built under the
   * `simple` configuration, which keeps stopwords rather than dropping them.
   * The lexical half would answer almost nothing on real questions, and would
   * do it silently.
   *
   * So the question is lexed by `to_tsvector` — which emits lexemes and never
   * operators — and the lexemes are re-joined with `|`, each through
   * `quote_literal`. That is what makes arbitrary user text safe here without
   * a sanitizer of our own: `-negated & ampersand | pipe !bang` comes back as
   * five ordinary quoted lexemes. A question that lexes to nothing yields a
   * NULL query, `@@` yields NULL, and the half contributes no candidates —
   * the correct outcome, and not an error.
   *
   * The OR then has to be paid for on the ranking side, and the payment is
   * dropping the question's filler words. English filler comes out through
   * the `english` configuration's own stopword list; Indonesian filler needs
   * {@link INDONESIAN_QUERY_STOPWORDS}, because Postgres's `indonesian`
   * configuration is a stemmer with **no** stopword list. Both apply to the
   * query only — the index keeps every word, so this is a tuning change and
   * never a re-ingest.
   */
  async searchByFullText(
    params: RetrieveDocumentChunksParams,
  ): Promise<RankedDocumentChunkCandidate[]> {
    const rows = await this.prismaService.$queryRaw<RetrievalRow[]>`
      WITH search_query AS (
        SELECT to_tsquery(
          ${TEXT_SEARCH_CONFIGURATION}::regconfig,
          (
            SELECT string_agg(quote_literal(lexeme), ' | ')
            FROM unnest(
              tsvector_to_array(
                to_tsvector(${TEXT_SEARCH_CONFIGURATION}::regconfig, ${params.queryText})
              )
            ) AS lexeme
            WHERE to_tsvector('english'::regconfig, lexeme) <> ''
              AND lexeme <> ALL (${INDONESIAN_QUERY_STOPWORDS as string[]}::text[])
          )
        ) AS query
      )
      SELECT c."id" AS chunk_id,
             c."document_id" AS document_id,
             d."title" AS document_title,
             c."chunk_index" AS chunk_index,
             c."content" AS content,
             c."language" AS language,
             d."owner_type"::text AS owner_type
      FROM "document_chunks" c
      JOIN "documents" d ON d."id" = c."document_id"
      CROSS JOIN search_query q
      WHERE c."search_vector" IS NOT NULL
        AND c."search_vector" @@ q.query
        AND d."deleted_at" IS NULL
        AND (
          (
            d."owner_type"::text = 'CLINIC'
            AND d."purpose"::text = 'FAQ_KNOWLEDGE_BASE'
            AND c."visibility"::text IN (${params.channelVisibility}, 'BOTH')
          )
          OR (
            ${params.ownerUserId}::uuid IS NOT NULL
            AND d."owner_id" = ${params.ownerUserId}::uuid
            AND d."owner_type"::text IN ('DOCTOR', 'ADMIN')
            AND d."purpose"::text = 'PERSONAL_KNOWLEDGE_BASE'
          )
        )
      ORDER BY ts_rank(c."search_vector", q.query) DESC, c."id" ASC
      LIMIT ${params.candidateLimit}
    `;
    return this.toRankedCandidates(rows);
  }

  /**
   * Attaches the 1-based position each row came back in. The underlying score
   * is dropped here on purpose: cosine distance and `ts_rank` are on
   * incomparable scales, and fusing the numbers instead of the ranks is the
   * mistake reciprocal rank fusion exists to prevent.
   */
  private toRankedCandidates(rows: RetrievalRow[]): RankedDocumentChunkCandidate[] {
    return rows.map((row, index) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      chunkIndex: Number(row.chunk_index),
      content: row.content,
      language: row.language,
      sourceTier: this.toSourceTier(row.owner_type),
      rank: index + 1,
    }));
  }

  /**
   * The scope predicate admits exactly two owner types beyond `CLINIC`, so
   * anything that is not the clinic corpus reached this row through the
   * owner filter and belongs to the asking user.
   */
  private toSourceTier(ownerType: string): RetrievalSourceTierValue {
    return ownerType === 'CLINIC' ? 'CLINIC' : 'PERSONAL';
  }

  /**
   * pgvector's input format, checked for finiteness first: `NaN` serializes to
   * a literal Postgres rejects and `Infinity` to one it accepts and then
   * cannot compute a distance against — which would fail the whole exchange
   * rather than the retrieval.
   */
  private toVectorLiteral(embedding: readonly number[]): string {
    if (embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('Query embedding contains a non-finite value');
    }
    return `[${embedding.join(',')}]`;
  }
}
