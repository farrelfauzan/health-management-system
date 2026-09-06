import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { StorageModule } from '../../common/storage/storage.module';
import { DocumentTemplateController } from './controller/document-template.controller';
import { DocumentTemplateVariableController } from './controller/document-template-variable.controller';
import { DocumentTemplateRepository } from './repository/document-template.repository';
import { DocumentTemplateImportService } from './service/document-template-import.service';
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
  imports: [PdfModule, StorageModule],
  controllers: [DocumentTemplateController, DocumentTemplateVariableController],
  providers: [
    DocumentTemplateRepository,
    DocumentTemplateMapper,
    DocumentTemplateService,
    DocumentTemplatePreviewService,
    DocumentTemplateImportService,
  ],
  // Exported for P16-T06: the invoice render service resolves "the default
  // template's latest published version" through this service — a service
  // rather than the repository, because cross-module access goes through the
  // layer that owns the rules.
  exports: [DocumentTemplateService],
})
export class DocumentTemplateModule {}
