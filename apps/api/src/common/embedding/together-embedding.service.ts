import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveEmbeddingConfig } from './embedding.config';
import { EmbeddingService } from './embedding.service';
import {
  EmbedAttemptOutcome,
  EmbedTextsRequest,
  EmbedTextsResult,
  TogetherEmbeddingConfig,
} from './embedding.types';

const EMBED_PATH = '/v1/embeddings';

/** Together's suggested wait, in seconds, on a rate-limited response. */
const RATE_LIMIT_RESET_HEADER = 'x-ratelimit-reset';

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_FLOOR = 500;

/** First backoff step; doubled per attempt and clamped to `maxRetryDelayMs`. */
const BASE_RETRY_DELAY_MS = 500;

/**
 * Together AI-backed embeddings over the OpenAI-compatible `/v1/embeddings`
 * endpoint, which accepts an array `input` and answers with one object per
 * element — so a document's chunks go up in batches rather than one request
 * each (`PCS-T12`).
 *
 * **This adapter is a data processor, and the local one was not** (D-EMB-01).
 * Every chunk of every ingested document and every retrieval query crosses to
 * a third party here. `PCS-T02` chose local embeddings partly to avoid exactly
 * that, and this class exists because an operator decided the tradeoff the
 * other way — so the class is written to keep the crossing as narrow as it can
 * be: passage text goes up, vectors come back, nothing is logged, and the
 * credential never appears in an error or a log line.
 *
 * Two behaviours are not shared with the Ollama adapter, and both follow from
 * the embedder now being across a network somebody else operates:
 *
 * 1. **The response is re-sorted by `index`.** Ollama answers with a bare
 *    positional array; the OpenAI shape carries an explicit index per vector.
 *    Trusting arrival order where an index exists would be a silent bug on the
 *    first out-of-order response, and the damage — chunk N's text stored with
 *    chunk M's meaning — is undetectable downstream.
 * 2. **429 and 5xx are retried within a bounded budget.** A shared API has a
 *    rate limit; a local process did not.
 *
 * Every failure surfaces as a `ServiceUnavailableException` carrying no
 * upstream payload: the caller is the ingestion pipeline, which records the
 * reason on the document row, and a document's own text must never travel into
 * an error message an admin can read for a file they could not open.
 */
@Injectable()
export class TogetherEmbeddingService extends EmbeddingService {
  private readonly logger = new Logger(TogetherEmbeddingService.name);
  private readonly embeddingConfig: TogetherEmbeddingConfig;

  constructor(configService: ConfigService) {
    super();
    this.embeddingConfig = resolveEmbeddingConfig(configService).together;
  }

  get model(): string {
    return this.embeddingConfig.model;
  }

  get version(): string {
    return this.embeddingConfig.version;
  }

  get dimension(): number {
    return this.embeddingConfig.dimension;
  }

  async embedTexts(request: EmbedTextsRequest): Promise<EmbedTextsResult> {
    if (request.texts.length === 0) {
      return this.buildResult([]);
    }
    this.assertConfigured();
    const embeddings: number[][] = [];
    for (const batch of this.splitIntoBatches(request.texts)) {
      embeddings.push(...(await this.embedBatch(batch)));
    }
    return this.buildResult(embeddings);
  }

  /**
   * Names the missing variable rather than letting the provider answer 401.
   *
   * An unconfigured key is the single most likely way this adapter fails, and
   * an operator reading "Embedding provider responded with status 401" has to
   * guess between a missing key, a revoked key, and a wrong base URL.
   */
  private assertConfigured(): void {
    if (this.embeddingConfig.apiKey === '') {
      throw new ServiceUnavailableException(
        'Embedding provider is not configured: TOGETHER_API_KEY is empty while EMBEDDING_PROVIDER is TOGETHER',
      );
    }
  }

  private async embedBatch(texts: readonly string[]): Promise<number[][]> {
    const payload = await this.postEmbedRequest(texts);
    const embeddings = this.readEmbeddings(payload, texts.length);
    // Order is the contract: chunk N's vector must be chunk N's. A provider
    // that dropped or reordered one would otherwise attach every chunk's text
    // to a neighbour's meaning, and nothing downstream could detect it.
    embeddings.forEach((embedding) => this.assertDimension(embedding));
    return embeddings;
  }

  /**
   * Posts one batch, retrying a rate limit or a server error within the
   * configured budget.
   *
   * Only 429 and 5xx are retried. A 400 or a 401 will answer identically
   * however many times it is asked, and retrying it turns one clear failure
   * into the same failure several seconds later.
   */
  private async postEmbedRequest(texts: readonly string[]): Promise<unknown> {
    let lastFailure: Error = new ServiceUnavailableException('Embedding provider is unreachable');
    for (let attempt = 0; attempt <= this.embeddingConfig.maxRetries; attempt += 1) {
      const outcome = await this.attemptEmbedRequest(texts);
      if (outcome.kind === 'SUCCESS') {
        return outcome.payload;
      }
      lastFailure = outcome.failure;
      if (!outcome.isRetryable || attempt === this.embeddingConfig.maxRetries) {
        break;
      }
      await this.waitBefore(attempt + 1, outcome.retryAfterMs);
    }
    throw lastFailure;
  }

  private async attemptEmbedRequest(texts: readonly string[]): Promise<EmbedAttemptOutcome> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.embeddingConfig.timeoutMs);
    try {
      const response = await fetch(`${this.embeddingConfig.baseUrl}${EMBED_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.embeddingConfig.apiKey}`,
        },
        body: JSON.stringify({ model: this.embeddingConfig.model, input: [...texts] }),
        signal: abortController.signal,
      });
      if (!response.ok) {
        return this.buildFailedResponseOutcome(response);
      }
      return { kind: 'SUCCESS', payload: await response.json() };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        return { kind: 'FAILURE', failure: err, isRetryable: false };
      }
      // The URL is safe to name and the model is not a secret; the texts and
      // the key are, so neither appears here.
      this.logger.error(
        `Embedding request to ${this.embeddingConfig.baseUrl} failed (model=${this.embeddingConfig.model})`,
      );
      return {
        kind: 'FAILURE',
        failure: new ServiceUnavailableException('Embedding provider is unreachable'),
        // A timeout or a dropped socket is exactly the transient class retries
        // exist for.
        isRetryable: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildFailedResponseOutcome(response: {
    status: number;
    headers?: { get(name: string): string | null };
  }): EmbedAttemptOutcome {
    const isRetryable =
      response.status === TOO_MANY_REQUESTS || response.status >= SERVER_ERROR_FLOOR;
    return {
      kind: 'FAILURE',
      // The status is safe to surface; the body is not — an upstream error
      // page can quote the prompt it was given.
      failure: new ServiceUnavailableException(
        `Embedding provider responded with status ${response.status}`,
      ),
      isRetryable,
      ...(isRetryable ? { retryAfterMs: this.readRetryAfterMs(response.headers) } : {}),
    };
  }

  /**
   * Together answers a rate limit with the seconds until the window resets.
   * Honouring it beats guessing — an exponential backoff that undershoots is
   * just a second 429 — but it is still clamped, because a header asking for a
   * five-minute wait would hold an ingestion worker open for five minutes.
   */
  private readRetryAfterMs(headers?: { get(name: string): string | null }): number | undefined {
    const rawValue = headers?.get(RATE_LIMIT_RESET_HEADER);
    if (rawValue === null || rawValue === undefined || rawValue.trim() === '') {
      return undefined;
    }
    const seconds = Number(rawValue);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return undefined;
    }
    return Math.min(seconds * 1000, this.embeddingConfig.maxRetryDelayMs);
  }

  private async waitBefore(attempt: number, retryAfterMs?: number): Promise<void> {
    const backoffMs = Math.min(
      BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
      this.embeddingConfig.maxRetryDelayMs,
    );
    const delayMs = retryAfterMs ?? backoffMs;
    if (delayMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Reads `data[]` into positional order.
   *
   * The index is treated as authoritative and validated rather than trusted:
   * a duplicate or out-of-range index would otherwise leave a hole in the
   * array that `assertDimension` would read as `undefined` and report as a
   * width problem, which is a confusing name for a pairing problem.
   */
  private readEmbeddings(payload: unknown, expectedCount: number): number[][] {
    const data = (payload as { data?: unknown }).data;
    if (!Array.isArray(data)) {
      throw new ServiceUnavailableException('Embedding provider returned an unexpected shape');
    }
    if (data.length !== expectedCount) {
      throw new ServiceUnavailableException(
        `Embedding provider returned ${data.length} vectors for ${expectedCount} inputs`,
      );
    }
    const ordered: number[][] = new Array<number[]>(expectedCount);
    data.forEach((entry, position) => {
      const index = this.readIndex(entry, position, expectedCount);
      if (ordered[index] !== undefined) {
        throw new ServiceUnavailableException(
          'Embedding provider returned a duplicate vector index',
        );
      }
      ordered[index] = this.readVector(entry);
    });
    return ordered;
  }

  private readIndex(entry: unknown, position: number, expectedCount: number): number {
    const index = (entry as { index?: unknown }).index;
    // A provider that omits the index is answering positionally, which is the
    // Ollama shape and is fine — the guard is against a *wrong* index, not a
    // missing one.
    if (index === undefined) {
      return position;
    }
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= expectedCount
    ) {
      throw new ServiceUnavailableException('Embedding provider returned an out-of-range index');
    }
    return index;
  }

  private readVector(entry: unknown): number[] {
    const embedding = (entry as { embedding?: unknown }).embedding;
    if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number')) {
      throw new ServiceUnavailableException('Embedding provider returned a non-numeric vector');
    }
    return embedding as number[];
  }

  /**
   * The check that stops a silent model swap. A `vector(1024)` column rejects
   * nothing about *meaning* — only width — so an embedder answering with the
   * declared width from a different model still corrupts the space. Width is
   * the one mechanical half of that failure, and refusing it here is what
   * turns "retrieval got worse" into an error someone can act on.
   */
  private assertDimension(embedding: number[]): void {
    if (embedding.length !== this.embeddingConfig.dimension) {
      throw new ServiceUnavailableException(
        `Embedding provider returned ${embedding.length} dimensions, expected ${this.embeddingConfig.dimension} — check TOGETHER_EMBEDDING_MODEL against the vector column width`,
      );
    }
  }

  private splitIntoBatches(texts: readonly string[]): string[][] {
    const batches: string[][] = [];
    for (let index = 0; index < texts.length; index += this.embeddingConfig.maxBatchSize) {
      batches.push([...texts.slice(index, index + this.embeddingConfig.maxBatchSize)]);
    }
    return batches;
  }

  private buildResult(embeddings: number[][]): EmbedTextsResult {
    return {
      embeddings,
      model: this.embeddingConfig.model,
      version: this.embeddingConfig.version,
      dimension: this.embeddingConfig.dimension,
    };
  }
}
