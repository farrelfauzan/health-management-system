import { forwardRef, Module } from '@nestjs/common';

import { EmbeddingModule } from '../../common/embedding/embedding.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentDeliveryModule } from '../document-delivery/document-delivery.module';
import { NotificationModule } from '../notification/notification.module';
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
import { VaultDocumentShareRepository } from './repository/vault-document-share.repository';
import { SharedWithMeDocumentController } from './controller/shared-with-me-document.controller';
import { VaultDocumentController } from './controller/vault-document.controller';
import { VaultDocumentShareController } from './controller/vault-document-share.controller';
import { VaultShareRecipientController } from './controller/vault-share-recipient.controller';
import { VaultDocumentAccessService } from './service/vault-document-access.service';
import { VaultDocumentService } from './service/vault-document.service';
import { VaultDocumentExpiryWorker } from './service/vault-document-expiry.worker';
import { VaultDocumentShareService } from './service/vault-document-share.service';
import { VaultOffboardingService } from './service/vault-offboarding.service';
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
 *
 * `NotificationModule` arrives with `P16-T18`'s reminder sweep, which tells a
 * vault's owner — and only its owner — that one of their documents is nearing
 * its expiry date. The clinic's own need to know that a practitioner is out
 * of licence is answered elsewhere entirely, by `DoctorLicense` (`P16-T19`),
 * which touches no document. `P16-T34`'s sharing engine produces the module's
 * other two bells: the recipient is told a document was shared with them, and
 * the owner is told the first time it is opened.
 *
 * `P16-T34`'s two controllers are split by *who is asking*:
 * `VaultDocumentShareController` is the owner handing out and taking back
 * keys, `SharedWithMeDocumentController` is the recipient using one. That
 * split is what bounds a recipient's capability to view-and-download — there
 * is no rename or delete route on the recipient side to refuse, because the
 * owner-scoped controller queries by owner and a shared document is not in
 * the set it sees.
 */
@Module({
  // `DocumentDeliveryModule` through `forwardRef`, because the import graph
  // loops: delivery → channel gateway → customer service → this module (the
  // FAQ search). Release (`P16-T40`) asks delivery to dispatch; nothing in
  // delivery reaches back into a service here.
  imports: [
    AuthModule,
    StorageModule,
    EmbeddingModule,
    NotificationModule,
    forwardRef(() => DocumentDeliveryModule),
  ],
  controllers: [
    DocumentAdminController,
    PersonalDocumentController,
    PatientDocumentController,
    PatientDocumentDetailController,
    EncounterDocumentController,
    PortalDocumentController,
    VaultDocumentController,
    VaultDocumentShareController,
    VaultShareRecipientController,
    SharedWithMeDocumentController,
  ],
  providers: [
    DocumentRepository,
    VaultDocumentRepository,
    VaultDocumentShareRepository,
    VaultDocumentAccessService,
    VaultDocumentService,
    VaultDocumentExpiryWorker,
    VaultDocumentShareService,
    VaultOffboardingService,
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
    // Exported for `AdminManagementModule`'s offboarding action and sweep
    // (`P16-T41`): the count a super admin confirms and the end-of-window
    // purge, behind a service, so no other module reaches a vault repository.
    VaultOffboardingService,
  ],
})
export class DocumentManagementModule {}
