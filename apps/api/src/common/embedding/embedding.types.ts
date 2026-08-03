export type EmbeddingConfig = {
  readonly baseUrl: string;
  readonly model: string;
  /**
   * Bumped by an operator when the upstream model changes in a way the name
   * does not express — a re-pulled tag, a different quantization. Stamped on
   * every chunk beside {@link model} so a mixed corpus is detectable rather
   * than merely suspected.
   */
  readonly version: string;
  /**
   * Fixed by the model (1024 for `bge-m3`) and by the `vector(1024)` column
   * type. Asserted on every response: a model that returns a different width
   * is refused rather than written, because Postgres would accept the row and
   * retrieval would simply get worse with no error at all.
   */
  readonly dimension: number;
  readonly timeoutMs: number;
  readonly maxBatchSize: number;
};

export type EmbedTextsRequest = {
  texts: readonly string[];
};

export type EmbedTextsResult = {
  /** One vector per input, in the same order. */
  embeddings: number[][];
  model: string;
  version: string;
  dimension: number;
};
