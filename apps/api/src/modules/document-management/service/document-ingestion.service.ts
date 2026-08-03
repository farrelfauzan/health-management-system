import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CreateDocumentChunkData,
  DocumentIngestionConfig,
  DocumentRecord,
  INGESTIBLE_DOCUMENT_PURPOSES,
  IngestDocumentResult,
} from '@hms/shared-types';

import { EmbeddingService } from '../../../common/embedding/embedding.service';
import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { resolveDocumentIngestionConfig } from '../document-ingestion.config';
import { DocumentIngestionError } from '../document-ingestion.error';
import { DocumentChunkRepository } from '../repository/document-chunk.repository';
import { DocumentRepository } from '../repository/document.repository';
import { extractDocumentText } from './extract-document-text';
import { splitTextIntoChunks } from './split-text-into-chunks';

const MAX_INGEST_ERROR_LENGTH = 500;

/**
 * The extract → chunk → embed → store pipeline.
 *
 * Runs against a document already claimed into `PROCESSING`, so this service
 * owns the outcome and nothing else: it finishes with `READY` and a fresh
 * chunk set, or with `FAILED` and a reason. There is no path that leaves a
 * document in `PROCESSING`, because a row stuck there is invisible to every
 * later poll and looks to an operator exactly like one still being worked on.
 *
 * **Failure messages never carry document text.** The reason lands in
 * `ingestError`, which anyone who can list documents can read; a parser error
 * quoting the file it choked on would turn that column into a way to read a
 * document through an error message.
 */
@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);
  private readonly ingestionConfig: DocumentIngestionConfig;

  constructor(
    configService: ConfigService,
    private readonly documentRepository: DocumentRepository,
    private readonly documentChunkRepository: DocumentChunkRepository,
    private readonly objectStorageService: ObjectStorageService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.ingestionConfig = resolveDocumentIngestionConfig(configService);
  }

  get config(): DocumentIngestionConfig {
    return this.ingestionConfig;
  }

  /**
   * Ingests one claimed document. Never throws for a document-level problem —
   * an unreadable PDF is a fact about that row, not a reason to abandon the
   * batch it shares a poll cycle with.
   */
  async ingestDocument(document: DocumentRecord): Promise<IngestDocumentResult> {
    try {
      return await this.runPipeline(document);
    } catch (err) {
      return this.recordFailure(document, err);
    }
  }

  private async runPipeline(document: DocumentRecord): Promise<IngestDocumentResult> {
    this.assertIngestiblePurpose(document);
    const storedObject = await this.runStage('The stored file could not be read', () =>
      this.objectStorageService.getObject({ key: document.storageKey }),
    );
    const extracted = await this.runStage('The file could not be parsed as text', () =>
      extractDocumentText({ content: storedObject.body, mimeType: document.mimeType }),
    );
    const chunks = this.buildChunkTexts(extracted.text);
    if (chunks.length === 0) {
      // A file that reads as nothing is a real, common outcome — a scanned
      // PDF with no text layer. Failing says so; a READY document with zero
      // chunks would claim to be searchable and answer nothing.
      throw new DocumentIngestionError('No text could be extracted from this document');
    }
    const embedded = await this.runStage('The embedding provider could not be reached', () =>
      this.embeddingService.embedTexts({ texts: chunks }),
    );
    // Built outside the stage wrapper on purpose: the pairing check inside
    // raises its own authored reason, and running it in here would relabel a
    // mispaired vector set as a storage failure.
    const chunkRows = this.buildChunkRows(document, chunks, embedded.embeddings);
    const chunkCount = await this.runStage('The chunks could not be stored', () =>
      this.documentChunkRepository.replaceDocumentChunks({
        documentId: document.id,
        chunks: chunkRows,
        ingestedAt: new Date(),
      }),
    );
    this.logger.log(
      `Ingested document ${document.id}: ${chunkCount} chunks, model=${embedded.model}@${embedded.version}`,
    );
    return {
      documentId: document.id,
      ingestStatus: 'READY',
      chunkCount,
      ingestError: null,
    };
  }

  /**
   * A `GENERAL` document reaching the pipeline means something upstream
   * queued it by mistake. Refusing here keeps "stored but never embedded"
   * true by enforcement rather than by everyone remembering it.
   */
  private assertIngestiblePurpose(document: DocumentRecord): void {
    const isIngestible = INGESTIBLE_DOCUMENT_PURPOSES.some(
      (purpose) => purpose === document.purpose,
    );
    if (!isIngestible) {
      throw new DocumentIngestionError(
        `Documents with purpose ${document.purpose} are not ingested`,
      );
    }
  }

  /**
   * Runs one stage and replaces whatever it throws with an authored category
   * message. The upstream detail is deliberately dropped rather than
   * appended: it goes to the log, where an operator with server access can
   * read it, and not to a database column every document lister can.
   */
  private async runStage<TResult>(
    failureReason: string,
    stage: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await stage();
    } catch (err) {
      this.logger.warn(
        `Document ingestion stage failed: ${failureReason} (${err instanceof Error ? err.name : 'unknown'})`,
      );
      throw new DocumentIngestionError(failureReason);
    }
  }

  private buildChunkTexts(text: string): string[] {
    const chunks = splitTextIntoChunks({
      text,
      maxCharacters: this.ingestionConfig.maxChunkCharacters,
      overlapCharacters: this.ingestionConfig.chunkOverlapCharacters,
    });
    if (chunks.length <= this.ingestionConfig.maxChunksPerDocument) {
      return chunks;
    }
    // Truncation is logged rather than silent: a corpus that quietly stops
    // covering the second half of a manual reads as retrieval getting worse.
    this.logger.warn(
      `Document produced ${chunks.length} chunks, capped at ${this.ingestionConfig.maxChunksPerDocument}`,
    );
    return chunks.slice(0, this.ingestionConfig.maxChunksPerDocument);
  }

  private buildChunkRows(
    document: DocumentRecord,
    chunks: readonly string[],
    embeddings: readonly number[][],
  ): CreateDocumentChunkData[] {
    // The pairing invariant, asserted where the pairing happens rather than
    // trusted from the adapter: chunk N must carry chunk N's vector, and a
    // mismatch would silently attach every passage's text to a neighbour's
    // meaning — a corruption no later stage could detect.
    if (embeddings.length !== chunks.length) {
      throw new DocumentIngestionError('The embedding provider returned a mismatched vector count');
    }
    return chunks.map((content, chunkIndex) => ({
      chunkIndex,
      content,
      embedding: [...(embeddings[chunkIndex] ?? [])],
      embeddingModel: this.embeddingService.model,
      embeddingVersion: this.embeddingService.version,
      // Copied from the parent at ingest, which is what makes re-ingesting
      // the act that republishes a visibility change.
      visibility: document.visibility,
      language: document.language,
    }));
  }

  private async recordFailure(
    document: DocumentRecord,
    err: unknown,
  ): Promise<IngestDocumentResult> {
    const ingestError = this.toSafeIngestError(err);
    this.logger.error(buildSafeErrorLog('document_ingestion_failed', { documentId: document.id }));
    const failed = await this.documentRepository.markDocumentFailed(document.id, ingestError);
    return {
      documentId: document.id,
      ingestStatus: failed.ingestStatus,
      chunkCount: failed.chunkCount,
      ingestError,
    };
  }

  /**
   * Only an authored {@link DocumentIngestionError} message is persisted. Any
   * other thrown value — a parser that quotes the bytes it choked on, a
   * client that echoes a URL — becomes a generic line, because `ingestError`
   * is readable by everyone who can list documents.
   */
  private toSafeIngestError(err: unknown): string {
    if (!(err instanceof DocumentIngestionError)) {
      return 'Ingestion failed unexpectedly';
    }
    return err.message.slice(0, MAX_INGEST_ERROR_LENGTH);
  }
}
