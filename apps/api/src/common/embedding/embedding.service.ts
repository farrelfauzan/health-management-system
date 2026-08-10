import { EmbedTextsRequest, EmbedTextsResult } from './embedding.types';

/**
 * Provider-neutral text-embedding contract. Feature modules inject this and
 * never reach an embedding vendor's HTTP surface directly.
 *
 * Two backends satisfy it (D-EMB-01, `PCS-T12`): hosted Together AI by
 * default, and local Ollama for a deployment that will not add a third-party
 * processor to its UU PDP account. Both are configured to a **1024-wide
 * multilingual model**, and that is not a coincidence to be relied on loosely
 * — the corpus column is `vector(1024)` and the cross-lingual ID↔EN property
 * is what the whole FAQ channel rests on, so an implementation that satisfies
 * this contract at some other width or in English only would type-check and
 * quietly ruin retrieval.
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
