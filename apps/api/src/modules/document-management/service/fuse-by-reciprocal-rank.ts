import { RankedDocumentChunkCandidate, RetrievedDocumentChunk } from '@hms/shared-types';

export type FuseByReciprocalRankParams = {
  /** One list per retrieval half, each already ordered best-first. */
  rankedLists: ReadonlyArray<readonly RankedDocumentChunkCandidate[]>;
  rankConstant: number;
  limit: number;
};

/**
 * Reciprocal rank fusion (ai-chatbot-tools.md §5.3).
 *
 * Each list contributes `1 / (k + rank)` to every chunk it returned, and the
 * contributions are summed. The property that makes it the right instrument
 * here is that it consumes **positions, not scores**: cosine distance and
 * `ts_rank` are on scales with no shared meaning, so any attempt to weight
 * and add them directly is tuning a number nobody can interpret. RRF needs no
 * such calibration, which is why it works the day the corpus changes shape.
 *
 * The rank constant `k` decides how sharply a top position outweighs a lower
 * one. At the conventional 60 a passage both halves rank mid-list beats one
 * that only a single half put first — agreement across two independent
 * retrieval strategies is exactly the signal worth rewarding, and it is what
 * stops a lexically identical but semantically irrelevant passage from
 * dominating on a shared drug name.
 *
 * Ordering is fully deterministic — score, then best position across the
 * lists, then chunk id — because a retrieval evaluation (`P15-T12`) that
 * reorders ties between runs cannot establish a baseline.
 */
export function fuseByReciprocalRank(
  params: FuseByReciprocalRankParams,
): RetrievedDocumentChunk[] {
  type FusedEntry = { candidate: RankedDocumentChunkCandidate; score: number; bestRank: number };
  const fused = new Map<string, FusedEntry>();
  for (const rankedList of params.rankedLists) {
    for (const candidate of rankedList) {
      const contribution = 1 / (params.rankConstant + candidate.rank);
      const existing = fused.get(candidate.chunkId);
      if (existing === undefined) {
        fused.set(candidate.chunkId, {
          candidate,
          score: contribution,
          bestRank: candidate.rank,
        });
        continue;
      }
      existing.score += contribution;
      existing.bestRank = Math.min(existing.bestRank, candidate.rank);
    }
  }
  return [...fused.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.bestRank - right.bestRank ||
        left.candidate.chunkId.localeCompare(right.candidate.chunkId),
    )
    .slice(0, params.limit)
    .map(({ candidate, score }) => ({
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentTitle: candidate.documentTitle,
      chunkIndex: candidate.chunkIndex,
      content: candidate.content,
      language: candidate.language,
      sourceTier: candidate.sourceTier,
      score,
    }));
}
