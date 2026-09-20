import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { TaxAssignmentController } from './controller/tax-assignment.controller';
import { TaxCategoryDefaultController } from './controller/tax-category-default.controller';
import { TaxCodeController } from './controller/tax-code.controller';
import { TaxSettingsController } from './controller/tax-settings.controller';
import { TaxAssignmentRepository } from './repository/tax-assignment.repository';
import { TaxCodeRepository } from './repository/tax-code.repository';
import { TaxSettingsRepository } from './repository/tax-settings.repository';
import { TaxAssignmentService } from './service/tax-assignment.service';
import { TaxCodeService } from './service/tax-code.service';
import { TaxSettingsService } from './service/tax-settings.service';

/**
 * Clinic taxes (P27). T02 brought the tax profile and T03 the tax codes,
 * their rates, the category defaults and the code on every tariff and
 * medication; invoice tax and the monthly drafts join it in later tickets. Reads the clinic's NPWP through
 * `ClinicProfileService`, which owns it.
 */
@Module({
  imports: [AuthModule, BillingModule],
  controllers: [
    TaxSettingsController,
    TaxCodeController,
    TaxCategoryDefaultController,
    TaxAssignmentController,
  ],
  providers: [
    TaxSettingsService,
    TaxSettingsRepository,
    TaxCodeService,
    TaxCodeRepository,
    TaxAssignmentService,
    TaxAssignmentRepository,
  ],
  exports: [TaxSettingsService, TaxCodeService],
})
export class TaxesModule {}
