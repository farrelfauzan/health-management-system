import { EmbedTextsRequest, EmbedTextsResult } from './embedding.types';

/**
 * Provider-neutral text-embedding contract. Feature modules inject this and
 * never reach an embedding vendor's HTTP surface directly.
 *
 * Embeddings are local (Ollama, `bge-m3`) rather than a hosted API for two
 * reasons that are not interchangeable: cross-lingual ID↔EN retrieval quality,
 * and the fact that a hosted embedder would see the text of every document
 * and every question — a second processor to account for under UU PDP, added
 * for a feature that does not need one.
 */
export abstract class EmbeddingService {
  /** The model stamped on every chunk this service embeds. */
  abstract readonly model: string;

  /** The operator-set generation of {@link model}, stamped alongside it. */
  abstract readonly version: string;

  /** The vector width the `vector(n)` column is declared with. */
  abstract readonly dimension: number;

  /**
   * Embeds texts and returns one vector per input **in the same order**.
   * Implementations must assert the returned width against
   * {@link dimension}: a model that answers with a different width is a
   * misconfiguration that Postgres would happily store and retrieval would
   * silently degrade on.
   */
  abstract embedTexts(request: EmbedTextsRequest): Promise<EmbedTextsResult>;
}
