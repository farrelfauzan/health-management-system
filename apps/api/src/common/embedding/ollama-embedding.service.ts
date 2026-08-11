import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveEmbeddingConfig } from './embedding.config';
import { EmbeddingService } from './embedding.service';
import { EmbedTextsRequest, EmbedTextsResult, EmbeddingConfig } from './embedding.types';

const EMBED_PATH = '/api/embed';

/**
 * Ollama-backed embeddings over the native `/api/embed` endpoint, which
 * accepts an array `input` and answers with one vector per element — so a
 * document's chunks go up in batches rather than one request each.
 *
 * **The local half of D-EMB-01** (`PCS-T12`). No longer the default, but kept
 * a first-class adapter rather than a deprecated one: a clinic that will not
 * add a third-party processor to its UU PDP account still has to be able to
 * run this feature, and `bge-m3` is still the model that proved the
 * cross-lingual ID↔EN retrieval `PCS-T02` was chosen for.
 *
 * Every failure surfaces as a `ServiceUnavailableException` carrying no
 * upstream payload: the caller is the ingestion pipeline, which records the
 * reason on the document row, and a document's own text must never travel
 * into an error message an admin can read for a file they could not open.
 */
@Injectable()
export class OllamaEmbeddingService extends EmbeddingService {
  private readonly logger = new Logger(OllamaEmbeddingService.name);
  private readonly embeddingConfig: EmbeddingConfig;

  constructor(configService: ConfigService) {
    super();
    this.embeddingConfig = resolveEmbeddingConfig(configService).ollama;
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
    const embeddings: number[][] = [];
    for (const batch of this.splitIntoBatches(request.texts)) {
      embeddings.push(...(await this.embedBatch(batch)));
    }
    return this.buildResult(embeddings);
  }

  private async embedBatch(texts: readonly string[]): Promise<number[][]> {
    const payload = await this.postEmbedRequest(texts);
    const embeddings = this.readEmbeddings(payload);
    if (embeddings.length !== texts.length) {
      throw new ServiceUnavailableException(
        `Embedding provider returned ${embeddings.length} vectors for ${texts.length} inputs`,
      );
    }
    // Order is the contract: chunk N's vector must be chunk N's. A provider
    // that dropped or reordered one would otherwise attach every chunk's text
    // to a neighbour's meaning, and nothing downstream could detect it.
    embeddings.forEach((embedding) => this.assertDimension(embedding));
    return embeddings;
  }

  private async postEmbedRequest(texts: readonly string[]): Promise<unknown> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.embeddingConfig.timeoutMs);
    try {
      const response = await fetch(`${this.embeddingConfig.baseUrl}${EMBED_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.embeddingConfig.model, input: [...texts] }),
        signal: abortController.signal,
      });
      if (!response.ok) {
        // The status is safe to surface; the body is not — an upstream error
        // page can quote the prompt it was given.
        throw new ServiceUnavailableException(
          `Embedding provider responded with status ${response.status}`,
        );
      }
      return await response.json();
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.logger.error(
        `Embedding request to ${this.embeddingConfig.baseUrl} failed (model=${this.embeddingConfig.model})`,
      );
      throw new ServiceUnavailableException('Embedding provider is unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private readEmbeddings(payload: unknown): number[][] {
    const embeddings = (payload as { embeddings?: unknown }).embeddings;
    if (!Array.isArray(embeddings)) {
      throw new ServiceUnavailableException('Embedding provider returned an unexpected shape');
    }
    return embeddings.map((embedding) => {
      if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number')) {
        throw new ServiceUnavailableException('Embedding provider returned a non-numeric vector');
      }
      return embedding as number[];
    });
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
        `Embedding provider returned ${embedding.length} dimensions, expected ${this.embeddingConfig.dimension} — check OLLAMA_EMBEDDING_MODEL against the vector column width`,
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
