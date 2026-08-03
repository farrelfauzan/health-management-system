import { Module } from '@nestjs/common';

import { EmbeddingModule } from '../../common/embedding/embedding.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentAdminController } from './controller/document-admin.controller';
import { DocumentChunkRepository } from './repository/document-chunk.repository';
import { DocumentRetrievalRepository } from './repository/document-retrieval.repository';
import { DocumentRepository } from './repository/document.repository';
import { DocumentIngestionService } from './service/document-ingestion.service';
import { DocumentIngestionWorker } from './service/document-ingestion.worker';
import { DocumentRetrievalService } from './service/document-retrieval.service';
import { DocumentService } from './service/document.service';

/**
 * The shared document store (P15-T10). One module holds the clinic FAQ/SOP
 * corpus, the Phase 15 retrieval corpora, personal knowledge bases, and the
 * future patient/doctor document features — one ingestion pipeline, one
 * embedding space, one S3 layout (customer-service strategy D-CS-06).
 *
 * The first slice landed the schema and its grants; the second added the
 * admin API over the **clinic corpus** and made this module the first
 * consumer of `ObjectStorageService`. The third completed `P15-T10` with the
 * extract → chunk → embed pipeline: a background worker claims `PENDING`
 * documents, `EmbeddingService` turns their passages into vectors on a local
 * Ollama, and `DocumentChunkRepository` writes them through raw SQL, which is
 * the only way `vector(1024)` and `tsvector` columns can be written at all.
 * `P15-T11` adds the read side — `DocumentRetrievalService`, the hybrid
 * vector-plus-lexical search fused by reciprocal rank — and exports it, so
 * the chatbot and the future WA/Telegram channel share **one** scope
 * predicate rather than each writing their own. The owner-scoped personal
 * routes (`P15-T20`) remain; the repositories already take `ownerType`/
 * `ownerId` as required arguments, so they are not a widening of any query
 * written here.
 *
 * `AuthModule` is imported for `AuthRepository`: the global guard proves the
 * actor may act on *some* document, and only a scope check in the service can
 * tell an admin's `ANY` grant from a doctor's `OWN` one.
 */
@Module({
  imports: [AuthModule, StorageModule, EmbeddingModule],
  controllers: [DocumentAdminController],
  providers: [
    DocumentRepository,
    DocumentChunkRepository,
    DocumentRetrievalRepository,
    DocumentService,
    DocumentIngestionService,
    DocumentIngestionWorker,
    DocumentRetrievalService,
  ],
  exports: [
    DocumentRepository,
    DocumentChunkRepository,
    DocumentService,
    DocumentRetrievalService,
  ],
})
export class DocumentManagementModule {}
