import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { TaxSettingsController } from './controller/tax-settings.controller';
import { TaxSettingsRepository } from './repository/tax-settings.repository';
import { TaxSettingsService } from './service/tax-settings.service';

/**
 * Clinic taxes (P27). T02 brings the tax profile; tax codes, invoice tax and
 * the monthly drafts join it in later tickets. Reads the clinic's NPWP through
 * `ClinicProfileService`, which owns it.
 */
@Module({
  imports: [AuthModule, BillingModule],
  controllers: [TaxSettingsController],
  providers: [TaxSettingsService, TaxSettingsRepository],
  exports: [TaxSettingsService],
})
export class TaxesModule {}
