import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { TaxCoreModule } from '../tax-core/tax-core.module';
import { TaxAssignmentController } from './controller/tax-assignment.controller';
import { TaxCategoryDefaultController } from './controller/tax-category-default.controller';
import { TaxCodeController } from './controller/tax-code.controller';
import { TaxPriceBreakdownController } from './controller/tax-price-breakdown.controller';
import { TaxReportController } from './controller/tax-report.controller';
import { TaxReportRepository } from './repository/tax-report.repository';
import { TaxSettingsController } from './controller/tax-settings.controller';
import { TaxAssignmentService } from './service/tax-assignment.service';
import { TaxPriceBreakdownService } from './service/tax-price-breakdown.service';
import { TaxReportService } from './service/tax-report.service';
import { TaxSettingsService } from './service/tax-settings.service';

/**
 * Clinic taxes (P27). T02 brought the tax profile and T03 the tax codes,
 * their rates, the category defaults and the code on every tariff and
 * medication; T04 the before/after-PPN breakdown for the price lists (invoice
 * tax itself lives in `TaxCoreModule`, which billing imports). Reads the clinic's NPWP through
 * `ClinicProfileService`, which owns it.
 */
@Module({
  imports: [AuthModule, BillingModule, TaxCoreModule],
  controllers: [
    TaxSettingsController,
    TaxCodeController,
    TaxCategoryDefaultController,
    TaxAssignmentController,
    TaxPriceBreakdownController,
    TaxReportController,
  ],
  providers: [
    TaxSettingsService,
    TaxAssignmentService,
    TaxPriceBreakdownService,
    TaxReportService,
    TaxReportRepository,
  ],
  exports: [TaxSettingsService],
})
export class TaxesModule {}
