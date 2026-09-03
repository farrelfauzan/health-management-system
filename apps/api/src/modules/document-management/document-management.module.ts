import { Module } from '@nestjs/common';

import { EmbeddingModule } from '../../common/embedding/embedding.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentAdminController } from './controller/document-admin.controller';
import { EncounterDocumentController } from './controller/encounter-document.controller';
import { PatientDocumentController } from './controller/patient-document.controller';
import { PatientDocumentDetailController } from './controller/patient-document-detail.controller';
import { PersonalDocumentController } from './controller/personal-document.controller';
import { PortalDocumentController } from './controller/portal-document.controller';
import { DocumentChunkRepository } from './repository/document-chunk.repository';
import { DocumentRetrievalRepository } from './repository/document-retrieval.repository';
import { DocumentRepository } from './repository/document.repository';
import { VaultDocumentRepository } from './repository/vault-document.repository';
import { VaultDocumentController } from './controller/vault-document.controller';
import { VaultDocumentService } from './service/vault-document.service';
import { DocumentIngestionService } from './service/document-ingestion.service';
import { DocumentIngestionWorker } from './service/document-ingestion.worker';
import { DocumentRetrievalService } from './service/document-retrieval.service';
import { DocumentService } from './service/document.service';
import { FaqSearchService } from './service/faq-search.service';
import { PatientDocumentAccessService } from './service/patient-document-access.service';
import { PatientDocumentService } from './service/patient-document.service';
import { PersonalDocumentService } from './service/personal-document.service';
import { UploadedDocumentGuardService } from './service/uploaded-document-guard.service';

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
 * documents, `EmbeddingService` turns their passages into vectors on whichever
 * backend `EMBEDDING_PROVIDER` names — hosted Together AI by default, local
 * Ollama on request, which is the difference between having a second data
 * processor and not (D-EMB-01, inventoried in `docs/security/ai-vendor-dpa.md`)
 * — and `DocumentChunkRepository` writes them through raw SQL, which is
 * the only way `vector(1024)` and `tsvector` columns can be written at all.
 * `P15-T11` adds the read side — `DocumentRetrievalService`, the hybrid
 * vector-plus-lexical search fused by reciprocal rank — and exports it, so
 * the chatbot and the future WA/Telegram channel share **one** scope
 * predicate rather than each writing their own. `P15-T20` adds the last
 * piece: `PersonalDocumentService` over the same repositories, scoped to the
 * caller. It is a second controller rather than a mode of the admin one
 * because the two differ in the only way that matters — who owns the rows
 * they may touch — and a shared route with a scope branch would put that
 * difference inside a conditional instead of in the URL.
 *
 * `AuthModule` is imported for `AuthRepository`: the global guard proves the
 * actor may act on *some* document, and only a scope check in the service can
 * tell an admin's `ANY` grant from a doctor's `OWN` one.
 */
@Module({
  imports: [AuthModule, StorageModule, EmbeddingModule],
  controllers: [
    DocumentAdminController,
    PersonalDocumentController,
    PatientDocumentController,
    PatientDocumentDetailController,
    EncounterDocumentController,
    PortalDocumentController,
    VaultDocumentController,
  ],
  providers: [
    DocumentRepository,
    VaultDocumentRepository,
    VaultDocumentService,
    DocumentChunkRepository,
    DocumentRetrievalRepository,
    DocumentService,
    PersonalDocumentService,
    PatientDocumentService,
    PatientDocumentAccessService,
    UploadedDocumentGuardService,
    DocumentIngestionService,
    DocumentIngestionWorker,
    DocumentRetrievalService,
    FaqSearchService,
  ],
  exports: [
    DocumentRepository,
    DocumentChunkRepository,
    DocumentService,
    DocumentRetrievalService,
    // Exported for the WA/Telegram tool registry at `PCS-T07`. It is the
    // channel's *only* sanctioned read of the corpus: `DocumentRetrievalService`
    // is exported too, but a caller reaching for that one on this channel can
    // name a visibility and an owner, which is the whole thing `PCS-T04`
    // removed.
    FaqSearchService,
  ],
})
export class DocumentManagementModule {}
