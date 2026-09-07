import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { EncounterLabOrderController } from './controller/encounter-lab-order.controller';
import { LabOrderController } from './controller/lab-order.controller';
import { LabPanelController } from './controller/lab-panel.controller';
import { LabSpecimenController } from './controller/lab-specimen.controller';
import { LabTestController } from './controller/lab-test.controller';
import { LabWorklistController } from './controller/lab-worklist.controller';
import { LabCatalogRepository } from './repository/lab-catalog.repository';
import { LabDailyNumberAllocatorRepository } from './repository/lab-daily-number-allocator.repository';
import { LabOrderRepository } from './repository/lab-order.repository';
import { LabSpecimenRepository } from './repository/lab-specimen.repository';
import { LabCatalogMapper } from './service/lab-catalog.mapper';
import { LabCatalogService } from './service/lab-catalog.service';
import { LabOrderAccessService } from './service/lab-order-access.service';
import { LabOrderMapper } from './service/lab-order.mapper';
import { LabOrderService } from './service/lab-order.service';
import { LabPaymentGateService } from './service/lab-payment-gate.service';
import { LabSpecimenService } from './service/lab-specimen.service';

/**
 * The laboratory module: the catalog (`P18-T01`), ordering (`P18-T02`) and the
 * specimens drawn against an order (`P18-T03`). Results, the report and the
 * SATUSEHAT lab chain join it later in P18.
 *
 * `AuthModule` for the actor behind an OWN scope check; `BillingModule` for the
 * pay-before-collect gate (`P18-T06`), which asks the module that owns money
 * whether the visit is settled rather than reading invoices itself. Nothing
 * here imports the EMR module — the encounter row ordering turns on is read
 * from this module's own repository, the way billing reads it, so the
 * dependency runs one way only.
 */
@Module({
  // ClinicalRequestDocumentModule for P18-T12: the surat pengantar is rendered
  // by the module that owns printing, from a context this module gathers —
  // what a lab order means stays here.
  imports: [AuthModule, BillingModule, ClinicalRequestDocumentModule],
  controllers: [
    LabTestController,
    LabPanelController,
    EncounterLabOrderController,
    LabOrderController,
    LabSpecimenController,
    LabWorklistController,
  ],
  providers: [
    LabCatalogRepository,
    LabDailyNumberAllocatorRepository,
    LabOrderRepository,
    LabSpecimenRepository,
    LabCatalogMapper,
    LabOrderMapper,
    LabCatalogService,
    LabOrderAccessService,
    LabOrderService,
    LabPaymentGateService,
    LabSpecimenService,
  ],
  // `LabOrderService` for `P18-T02`: closing an encounter names the lab work
  // still in flight, and the EMR module asks the module that owns orders rather
  // than reading its tables.
  exports: [LabCatalogService, LabOrderService],
})
export class LaboratoryModule {}
