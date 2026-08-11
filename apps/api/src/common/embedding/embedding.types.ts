/**
 * Which embedding backend is bound at startup (D-EMB-01).
 *
 * `TOGETHER` is the hosted default (`PCS-T12`) and `OLLAMA` the local
 * deployment, kept because a clinic that does not want a second data processor
 * must still be able to run this feature. Both are real, supported
 * configurations rather than a primary and a dead fallback — which is why the
 * choice is a value here instead of a comment on a constructor.
 */
export const EMBEDDING_PROVIDER_KINDS = ['TOGETHER', 'OLLAMA'] as const;

export type EmbeddingProviderKind = (typeof EMBEDDING_PROVIDER_KINDS)[number];

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
   * Fixed by the model (1024 for both `bge-m3` and
   * `intfloat/multilingual-e5-large-instruct`) and by the `vector(1024)`
   * column type. Asserted on every response: a model that returns a different
   * width is refused rather than written, because Postgres would accept the
   * row and retrieval would simply get worse with no error at all.
   */
  readonly dimension: number;
  readonly timeoutMs: number;
  readonly maxBatchSize: number;
};

/**
 * The hosted provider's configuration (`PCS-T12`).
 *
 * Two fields the local adapter has no use for, and both exist because the
 * embedder is now across a network someone else operates: a credential, and a
 * retry budget for the rate limit that comes with a shared API.
 */
export type TogetherEmbeddingConfig = EmbeddingConfig & {
  readonly apiKey: string;
  /**
   * Retries **after** the first attempt, so `2` means at most three requests.
   * Bounded rather than generous: ingestion is a background worker that can
   * be re-run, and a pipeline that retries for minutes turns one slow upload
   * into a queue nobody can drain.
   */
  readonly maxRetries: number;
  /** Ceiling on any single backoff wait, including one the provider asks for. */
  readonly maxRetryDelayMs: number;
};

/**
 * Every embedding provider's configuration, resolved together at startup.
 *
 * Both branches are resolved on every boot rather than only the selected one,
 * mirroring `resolveChannelGatewayConfig`. It costs nothing — neither opens a
 * connection — and it means a malformed `OLLAMA_EMBEDDING_BASE_URL` is a
 * startup error on a Together deployment too, instead of a surprise on the day
 * somebody falls back to local.
 */
export type EmbeddingProviderConfig = {
  readonly kind: EmbeddingProviderKind;
  readonly ollama: EmbeddingConfig;
  readonly together: TogetherEmbeddingConfig;
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

/**
 * One HTTP attempt's result inside the hosted adapter's retry loop
 * (`PCS-T12`).
 *
 * `isRetryable` is carried on the failure rather than re-derived by the
 * caller because only the attempt knows why it failed — a 400 and a dropped
 * socket both arrive at the same `catch`, and the decision to try again turns
 * on which one it was.
 */
export type EmbedAttemptOutcome =
  | { kind: 'SUCCESS'; payload: unknown }
  | {
      kind: 'FAILURE';
      failure: Error;
      isRetryable: boolean;
      /** The provider's own asked-for wait, already clamped. */
      retryAfterMs?: number;
    };
