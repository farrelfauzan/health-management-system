import { Module } from '@nestjs/common';

import { InvoiceController } from './controller/invoice.controller';
import { ServiceTariffController } from './controller/service-tariff.controller';
import { BillingRepository } from './repository/billing.repository';
import { InvoiceNumberAllocatorRepository } from './repository/invoice-number-allocator.repository';
import { ServiceTariffRepository } from './repository/service-tariff.repository';
import { BillingMapper } from './service/billing.mapper';
import { BillingService } from './service/billing.service';
import { ServiceTariffService } from './service/service-tariff.service';

@Module({
  controllers: [ServiceTariffController, InvoiceController],
  providers: [
    InvoiceNumberAllocatorRepository,
    ServiceTariffRepository,
    BillingRepository,
    BillingMapper,
    ServiceTariffService,
    BillingService,
  ],
})
export class BillingModule {}
