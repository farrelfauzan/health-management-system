import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { StorageModule } from '../../common/storage/storage.module';
import { DocumentTemplateModule } from '../document-template/document-template.module';
import { CashierReportController } from './controller/cashier-report.controller';
import { ClinicProfileController } from './controller/clinic-profile.controller';
import { InvoiceController } from './controller/invoice.controller';
import { InvoiceDocumentController } from './controller/invoice-document.controller';
import { ServiceTariffController } from './controller/service-tariff.controller';
import { BillingRepository } from './repository/billing.repository';
import { ClinicProfileRepository } from './repository/clinic-profile.repository';
import { InvoiceDocumentRepository } from './repository/invoice-document.repository';
import { InvoiceNumberAllocatorRepository } from './repository/invoice-number-allocator.repository';
import { ServiceTariffRepository } from './repository/service-tariff.repository';
import { AccommodationBillingService } from './service/accommodation-billing.service';
import { BillingMapper } from './service/billing.mapper';
import { BillingService } from './service/billing.service';
import { CashierReportService } from './service/cashier-report.service';
import { ClinicProfileService } from './service/clinic-profile.service';
import { InvoiceDocumentMapper } from './service/invoice-document.mapper';
import { InvoiceDocumentService } from './service/invoice-document.service';
import { ServiceTariffService } from './service/service-tariff.service';

@Module({
  // StorageModule for the clinic logo (P16-T02) and rendered invoice PDFs
  // (P16-T06); PdfModule for the render sidecar port; DocumentTemplateModule
  // because the render service resolves the default template's published
  // version through that module's service.
  imports: [StorageModule, PdfModule, DocumentTemplateModule],
  controllers: [
    ServiceTariffController,
    InvoiceController,
    InvoiceDocumentController,
    CashierReportController,
    ClinicProfileController,
  ],
  providers: [
    InvoiceNumberAllocatorRepository,
    ServiceTariffRepository,
    BillingRepository,
    ClinicProfileRepository,
    InvoiceDocumentRepository,
    BillingMapper,
    InvoiceDocumentMapper,
    ClinicProfileService,
    ServiceTariffService,
    BillingService,
    InvoiceDocumentService,
    CashierReportService,
    AccommodationBillingService,
  ],
  // Exported for `P15-T18`'s `get_daily_cashier_report` chat tool. A service
  // rather than a repository, deliberately: cross-module access goes through
  // the layer that owns the rules, so the tool cannot assemble a report the
  // REST route would not have produced.
  // Exported for IMP-15: the discharge transaction hands the finished stay to
  // the module that owns money, rather than writing invoice rows itself.
  exports: [CashierReportService, AccommodationBillingService],
})
export class BillingModule {}
