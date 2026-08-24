import { Module } from '@nestjs/common';

import { CashierReportController } from './controller/cashier-report.controller';
import { InvoiceController } from './controller/invoice.controller';
import { ServiceTariffController } from './controller/service-tariff.controller';
import { BillingRepository } from './repository/billing.repository';
import { InvoiceNumberAllocatorRepository } from './repository/invoice-number-allocator.repository';
import { ServiceTariffRepository } from './repository/service-tariff.repository';
import { AccommodationBillingService } from './service/accommodation-billing.service';
import { BillingMapper } from './service/billing.mapper';
import { BillingService } from './service/billing.service';
import { CashierReportService } from './service/cashier-report.service';
import { ServiceTariffService } from './service/service-tariff.service';

@Module({
  controllers: [ServiceTariffController, InvoiceController, CashierReportController],
  providers: [
    InvoiceNumberAllocatorRepository,
    ServiceTariffRepository,
    BillingRepository,
    BillingMapper,
    ServiceTariffService,
    BillingService,
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
