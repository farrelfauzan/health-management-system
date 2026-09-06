import { Module } from '@nestjs/common';

import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentTypeController } from './controller/document-type.controller';
import { ManagedDocumentController } from './controller/managed-document.controller';
import { DocumentTypeRepository } from './repository/document-type.repository';
import { ManagedDocumentRepository } from './repository/managed-document.repository';
import { DocumentTypeService } from './service/document-type.service';
import { ManagedDocumentAccessService } from './service/managed-document-access.service';
import { ManagedDocumentService } from './service/managed-document.service';

/**
 * The documents module (PRD §7.5, epic E5): one registry for every document
 * the clinic drafts, approves and issues — agreements, consents, policies,
 * letters, templates and bills — with its lifecycle and approval workflow.
 *
 * `P16-T39` lands the master data the rest hangs off: document types as
 * rows the clinic manages, with the approval policy on the row and the
 * `behavior` discriminator the seed owns. `P16-T28` adds the registry
 * (`ManagedDocument`): list, search, draft, edit, history and CSV export,
 * with the per-row source rule that makes the module a surface over other
 * modules' documents and never a bypass of their access rules (FR-E5-04).
 * `P16-T29` adds the approval engine.
 *
 * Its own module rather than a corner of `document-management`, because the
 * two answer different questions: that module is the *store* — bytes,
 * chunks, embeddings, the patient's clinical file, the doctor's vault — and
 * this one is the *governance* over documents the clinic itself issues. The
 * registry points at store rows through nullable subject keys; it never
 * absorbs them (§7.5.3).
 *
 * `AuthModule` is imported for `AuthRepository`: the global guard proves the
 * actor may use the registry, and only a re-read of their grants can say
 * which other modules' rows they may see through it. `StorageModule` for
 * the uploaded body's metadata, read back from the object at record time.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [DocumentTypeController, ManagedDocumentController],
  providers: [
    DocumentTypeRepository,
    DocumentTypeService,
    ManagedDocumentRepository,
    ManagedDocumentAccessService,
    ManagedDocumentService,
  ],
  // Exported for the modules that will register their own rows here —
  // billing writes a PATIENT_BILL at invoice issue, templates and the corpus
  // their governed documents — through the service, never the repository.
  exports: [DocumentTypeService, ManagedDocumentService],
})
export class ManagedDocumentModule {}
