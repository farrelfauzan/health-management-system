import { Module } from '@nestjs/common';

import { TaxAssignmentRepository } from './repository/tax-assignment.repository';
import { TaxCodeRepository } from './repository/tax-code.repository';
import { TaxSettingsRepository } from './repository/tax-settings.repository';
import { InvoiceTaxService } from './service/invoice-tax.service';
import { TaxCodeService } from './service/tax-code.service';
import { TaxProfileService } from './service/tax-profile.service';

/**
 * The tax rules every other module computes with (P27-T04): the tax profile,
 * tax codes with their rates and defaults, and the tax on an invoice line.
 * Depends on nothing but Prisma and audit, so billing can import it while the
 * tax settings screen (`TaxesModule`) imports billing for the clinic's NPWP.
 */
@Module({
  providers: [
    TaxCodeRepository,
    TaxSettingsRepository,
    TaxAssignmentRepository,
    TaxCodeService,
    TaxProfileService,
    InvoiceTaxService,
  ],
  exports: [
    TaxCodeService,
    TaxProfileService,
    InvoiceTaxService,
    TaxSettingsRepository,
    TaxAssignmentRepository,
  ],
})
export class TaxCoreModule {}
