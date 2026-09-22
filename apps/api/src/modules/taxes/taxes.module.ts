import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicianFeeModule } from '../clinician-fee/clinician-fee.module';
import { TaxCoreModule } from '../tax-core/tax-core.module';
import { TaxAssignmentController } from './controller/tax-assignment.controller';
import { TaxCategoryDefaultController } from './controller/tax-category-default.controller';
import { TaxCodeController } from './controller/tax-code.controller';
import { TaxPriceBreakdownController } from './controller/tax-price-breakdown.controller';
import { TaxReportController } from './controller/tax-report.controller';
import { TaxReportCoretaxFakturController } from './controller/tax-report-coretax-faktur.controller';
import { NotificationModule } from '../notification/notification.module';
import { ClinicianTaxIdentityRepository } from './repository/clinician-tax-identity.repository';
import { CoretaxFakturSourceRepository } from './repository/coretax-faktur-source.repository';
import { Pph21TaxBracketRepository } from './repository/pph21-tax-bracket.repository';
import { TaxReminderRepository } from './repository/tax-reminder.repository';
import { TaxReportRepository } from './repository/tax-report.repository';
import { TaxReportDocumentRepository } from './repository/tax-report-document.repository';
import { TaxSettingsController } from './controller/tax-settings.controller';
import { CoretaxFakturExportService } from './service/coretax-faktur-export.service';
import { TaxAssignmentService } from './service/tax-assignment.service';
import { TaxPriceBreakdownService } from './service/tax-price-breakdown.service';
import { TaxReportPdfService } from './service/tax-report-pdf.service';
import { TaxReportService } from './service/tax-report.service';
import { TaxCalendarService } from './service/tax-calendar.service';
import { TaxCalendarWorker } from './service/tax-calendar.worker';
import { TaxSettingsService } from './service/tax-settings.service';

/**
 * Clinic taxes (P27). T02 brought the tax profile and T03 the tax codes,
 * their rates, the category defaults and the code on every tariff and
 * medication; T04 the before/after-PPN breakdown for the price lists, T05 the monthly report
 * drafts and T12 their PDF, and T10 the calendar that reminds a clinic of a
 * due date it has not met (invoice
 * tax itself lives in `TaxCoreModule`, which billing imports). T07 adds the
 * PPh 21 bukan pegawai draft, read from the jasa medis ledger through
 * `ClinicianFeeStatementService`. Reads the clinic's NPWP through
 * `ClinicProfileService`, which owns it. T09 turns a
 * finalized PPN keluaran month into DJP's Faktur Keluaran Coretax import file.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    ClinicianFeeModule,
    TaxCoreModule,
    NotificationModule,
    PdfModule,
    StorageModule,
  ],
  controllers: [
    TaxSettingsController,
    TaxCodeController,
    TaxCategoryDefaultController,
    TaxAssignmentController,
    TaxPriceBreakdownController,
    TaxReportController,
    TaxReportCoretaxFakturController,
  ],
  providers: [
    TaxSettingsService,
    TaxAssignmentService,
    TaxPriceBreakdownService,
    TaxReportService,
    TaxReportRepository,
    Pph21TaxBracketRepository,
    ClinicianTaxIdentityRepository,
    TaxReportPdfService,
    TaxReportDocumentRepository,
    CoretaxFakturExportService,
    CoretaxFakturSourceRepository,
    TaxCalendarService,
    TaxCalendarWorker,
    TaxReminderRepository,
  ],
  exports: [TaxSettingsService],
})
export class TaxesModule {}
