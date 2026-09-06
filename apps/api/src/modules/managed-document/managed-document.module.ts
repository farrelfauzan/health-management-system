import { Module } from '@nestjs/common';

import { MailModule } from '../../common/mail/mail.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { NotificationModule } from '../notification/notification.module';
import { DocumentApprovalController } from './controller/document-approval.controller';
import { DocumentTypeController } from './controller/document-type.controller';
import { ManagedDocumentController } from './controller/managed-document.controller';
import { DocumentApprovalRepository } from './repository/document-approval.repository';
import { DocumentTypeRepository } from './repository/document-type.repository';
import { ManagedDocumentRepository } from './repository/managed-document.repository';
import { DocumentApprovalDeadlineWorker } from './service/document-approval-deadline.worker';
import { DocumentApprovalNotificationService } from './service/document-approval-notification.service';
import { DocumentApprovalService } from './service/document-approval.service';
import { DocumentIssueBehaviorService } from './service/document-issue-behavior.service';
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
 * `P16-T29` adds the approval engine: rounds with a drafter-named panel and
 * a deadline, a frozen payload, and the `document-approval.decide:any` key
 * that is deliberately not part of the write grant (§7.5.9). `P16-T30` adds
 * the notifications either side of a decision and the deadline sweep, which
 * is why this module now imports `NotificationModule` for the bell feed,
 * `MailModule` for the second channel, and `BillingModule` for the clinic
 * profile every outbound message is sent under (FR-E5-30).
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
 * signing uploads and downloads; `DocumentManagementModule` for the
 * confirm-time content gate (`P16-T36`) an uploaded body passes before a
 * row may point at it.
 */
@Module({
  imports: [
    AuthModule,
    StorageModule,
    DocumentManagementModule,
    NotificationModule,
    MailModule,
    BillingModule,
  ],
  controllers: [DocumentTypeController, ManagedDocumentController, DocumentApprovalController],
  providers: [
    DocumentTypeRepository,
    DocumentTypeService,
    ManagedDocumentRepository,
    ManagedDocumentAccessService,
    ManagedDocumentService,
    DocumentApprovalRepository,
    DocumentIssueBehaviorService,
    DocumentApprovalNotificationService,
    DocumentApprovalService,
    DocumentApprovalDeadlineWorker,
  ],
  // Exported for the modules that will register their own rows here —
  // billing writes a PATIENT_BILL at invoice issue, templates and the corpus
  // their governed documents — through the service, never the repository.
  exports: [DocumentTypeService, ManagedDocumentService],
})
export class ManagedDocumentModule {}
