import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { DocumentIngestionConfig } from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { DocumentRepository } from '../repository/document.repository';
import { DocumentIngestionService } from './document-ingestion.service';

/**
 * Interval poller for documents waiting to be embedded.
 *
 * Ingestion is asynchronous because it cannot be anything else: extracting a
 * forty-page PDF and embedding four hundred passages is tens of seconds of
 * work, and an admin's upload request must not hold a connection open for it.
 * The queue is the `ingestStatus` column rather than a broker — this is a
 * single-instance modular monolith, the state that matters is already in the
 * row, and a restart mid-document loses nothing that a re-claim does not
 * recover.
 *
 * Starts only when `DOCUMENT_INGESTION_ENABLED` is on, so dev, CI, and any
 * deployment without a reachable Ollama boot with no background loop failing
 * on a timer.
 */
@Injectable()
export class DocumentIngestionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentIngestionWorker.name);
  private readonly ingestionConfig: DocumentIngestionConfig;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly documentRepository: DocumentRepository,
    private readonly documentIngestionService: DocumentIngestionService,
  ) {
    this.ingestionConfig = documentIngestionService.config;
  }

  onApplicationBootstrap(): void {
    if (!this.ingestionConfig.isEnabled) {
      this.logger.log(
        'Document ingestion worker disabled (DOCUMENT_INGESTION_ENABLED is not true)',
      );
      return;
    }
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.ingestionConfig.pollIntervalMs);
    this.pollTimer.unref();
    this.logger.log(
      `Document ingestion worker polling every ${this.ingestionConfig.pollIntervalMs}ms`,
    );
  }

  onApplicationShutdown(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Runs one poll cycle and returns how many documents it processed.
   * Overlapping cycles are skipped, never queued: embedding is slow enough
   * that a backlog would otherwise start a second pass over rows the first is
   * still working through.
   */
  async pollOnce(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }
    this.isPolling = true;
    try {
      const claimed = await this.documentRepository.claimPendingDocuments(
        this.ingestionConfig.pollBatchLimit,
      );
      for (const document of claimed) {
        await this.documentIngestionService.ingestDocument(document);
      }
      return claimed.length;
    } catch {
      // A claim that failed leaves nothing half-done; the rows it did not win
      // are still PENDING and the next cycle sees them.
      this.logger.error(buildSafeErrorLog('document_ingestion_poll_failed'));
      return 0;
    } finally {
      this.isPolling = false;
    }
  }
}
