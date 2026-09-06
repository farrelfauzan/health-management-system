import { Module } from '@nestjs/common';

import { DocumentTypeController } from './controller/document-type.controller';
import { DocumentTypeRepository } from './repository/document-type.repository';
import { DocumentTypeService } from './service/document-type.service';

/**
 * The documents module (PRD §7.5, epic E5): one registry for every document
 * the clinic drafts, approves and issues — agreements, consents, policies,
 * letters, templates and bills — with its lifecycle and approval workflow.
 *
 * `P16-T39` lands the master data the rest hangs off: document types as
 * rows the clinic manages, with the approval policy on the row and the
 * `behavior` discriminator the seed owns. `P16-T28` adds the registry
 * (`ManagedDocument`) to this same module, `P16-T29` the approval engine.
 *
 * Its own module rather than a corner of `document-management`, because the
 * two answer different questions: that module is the *store* — bytes,
 * chunks, embeddings, the patient's clinical file, the doctor's vault — and
 * this one is the *governance* over documents the clinic itself issues. The
 * registry will point at store rows through nullable subject keys; it never
 * absorbs them (§7.5.3).
 */
@Module({
  controllers: [DocumentTypeController],
  providers: [DocumentTypeRepository, DocumentTypeService],
  // Exported for `P16-T28`: a new document is drafted against a live type, and
  // the registry asks this service — never the repository — which one.
  exports: [DocumentTypeService],
})
export class ManagedDocumentModule {}
