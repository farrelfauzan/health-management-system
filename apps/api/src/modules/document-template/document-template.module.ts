import { forwardRef, Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { StorageModule } from '../../common/storage/storage.module';
import { ManagedDocumentModule } from '../managed-document/managed-document.module';
import { DocumentTemplateController } from './controller/document-template.controller';
import { DocumentTemplateVariableController } from './controller/document-template-variable.controller';
import { DocumentTemplateRepository } from './repository/document-template.repository';
import { DocumentTemplateApprovalService } from './service/document-template-approval.service';
import { DocumentTemplateImportService } from './service/document-template-import.service';
import { InvoiceTemplateIssueHandler } from './service/invoice-template-issue.handler';
import { DocumentTemplateMapper } from './service/document-template.mapper';
import { DocumentTemplatePreviewService } from './service/document-template-preview.service';
import { DocumentTemplateService } from './service/document-template.service';

/**
 * Document templates and their variable registry (P16-T04/T05). Lifted out of
 * `billing` the moment the template models arrived, exactly as the variable
 * controller's docstring promised: templates serve invoices today but
 * clinical documents (E2) and agreements (E5) tomorrow, so the module is the
 * document family, not the bill.
 */
@Module({
  // PdfModule + StorageModule for the fixture preview (P16-T12): the sidecar
  // renders it and the bucket holds it for a few minutes.
  // `ManagedDocumentModule` for `P16-T32`: the publish gate reads the type's
  // approval policy, and the issue handler registers *itself* with the
  // behaviour seam on init, so nothing in the registry ever names a
  // template. `forwardRef` all the same, because the module graph loops
  // through billing — billing renders invoices from templates, and the
  // registry writes a PATIENT_BILL when billing issues one.
  imports: [PdfModule, StorageModule, forwardRef(() => ManagedDocumentModule)],
  controllers: [DocumentTemplateController, DocumentTemplateVariableController],
  providers: [
    DocumentTemplateRepository,
    DocumentTemplateMapper,
    DocumentTemplateService,
    DocumentTemplatePreviewService,
    DocumentTemplateImportService,
    DocumentTemplateApprovalService,
    InvoiceTemplateIssueHandler,
  ],
  // Exported for P16-T06: the invoice render service resolves "the default
  // template's latest published version" through this service — a service
  // rather than the repository, because cross-module access goes through the
  // layer that owns the rules.
  exports: [DocumentTemplateService],
})
export class DocumentTemplateModule {}
