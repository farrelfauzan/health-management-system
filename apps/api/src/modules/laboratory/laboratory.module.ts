import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { DocumentDeliveryModule } from '../document-delivery/document-delivery.module';
import { DocumentTemplateModule } from '../document-template/document-template.module';
import { NotificationModule } from '../notification/notification.module';
import { EncounterLabOrderController } from './controller/encounter-lab-order.controller';
import { LabOrderController } from './controller/lab-order.controller';
import { LabPanelController } from './controller/lab-panel.controller';
import { LabReportController } from './controller/lab-report.controller';
import { LabResultController } from './controller/lab-result.controller';
import { LabSpecimenController } from './controller/lab-specimen.controller';
import { LaboratorySettingsController } from './controller/laboratory-settings.controller';
import { LabTestController } from './controller/lab-test.controller';
import { LabWorklistController } from './controller/lab-worklist.controller';
import { PatientLabResultController } from './controller/patient-lab-result.controller';
import { LabCatalogRepository } from './repository/lab-catalog.repository';
import { LabDailyNumberAllocatorRepository } from './repository/lab-daily-number-allocator.repository';
import { LabOrderRepository } from './repository/lab-order.repository';
import { LabReportRepository } from './repository/lab-report.repository';
import { LabResultRepository } from './repository/lab-result.repository';
import { LabSpecimenRepository } from './repository/lab-specimen.repository';
import { LaboratorySettingsRepository } from './repository/laboratory-settings.repository';
import { LabCatalogMapper } from './service/lab-catalog.mapper';
import { LabCatalogService } from './service/lab-catalog.service';
import { LabOrderAccessService } from './service/lab-order-access.service';
import { LabOrderMapper } from './service/lab-order.mapper';
import { LabOrderService } from './service/lab-order.service';
import { LabPaymentGateService } from './service/lab-payment-gate.service';
import { LabReportMapper } from './service/lab-report.mapper';
import { LabReportService } from './service/lab-report.service';
import { LabReportWorker } from './service/lab-report.worker';
import { LabResultMapper } from './service/lab-result.mapper';
import { LabResultService } from './service/lab-result.service';
import { LabSpecimenService } from './service/lab-specimen.service';
import { LaboratorySettingsService } from './service/laboratory-settings.service';

/**
 * The laboratory module: the catalog (`P18-T01`), ordering (`P18-T02`), the
 * specimens drawn against an order (`P18-T03`), the values measured from
 * them (`P18-T04`) and the sheet those values become (`P18-T05`). The
 * SATUSEHAT lab chain joins it later in P18.
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
  // `NotificationModule` for P18-T04: a critical value reaches the ordering
  // doctor's bell on entry, before anybody has verified it.
  // `PdfModule`, `StorageModule` and `DocumentTemplateModule` for P18-T05: the
  // report is rendered through the same port, stored in the same bucket and
  // laid out by the same template registry the invoice uses — a fourth
  // template kind, not a second renderer. `DocumentDeliveryModule` for the
  // patient's end of dual delivery (P16-T40): the filed sheet is handed to
  // the module that owns consent and the locked attachment, never sent here.
  imports: [
    AuthModule,
    BillingModule,
    ClinicalRequestDocumentModule,
    NotificationModule,
    PdfModule,
    StorageModule,
    DocumentTemplateModule,
    DocumentDeliveryModule,
  ],
  controllers: [
    LabTestController,
    LabPanelController,
    EncounterLabOrderController,
    LabOrderController,
    LabSpecimenController,
    LabWorklistController,
    LabResultController,
    PatientLabResultController,
    LaboratorySettingsController,
    LabReportController,
  ],
  providers: [
    LabCatalogRepository,
    LabDailyNumberAllocatorRepository,
    LabOrderRepository,
    LabSpecimenRepository,
    LabResultRepository,
    LaboratorySettingsRepository,
    LabReportRepository,
    LabCatalogMapper,
    LabOrderMapper,
    LabResultMapper,
    LabReportMapper,
    LabCatalogService,
    LabOrderAccessService,
    LabOrderService,
    LabPaymentGateService,
    LabSpecimenService,
    LaboratorySettingsService,
    LabReportService,
    LabReportWorker,
    LabResultService,
  ],
  // `LabOrderService` for `P18-T02`: closing an encounter names the lab work
  // still in flight, and the EMR module asks the module that owns orders rather
  // than reading its tables.
  // `LabResultService` for `P18-T04`: the encounter record shows released
  // values next to the vitals, and the EMR module asks the module that owns
  // results rather than reading its tables.
  exports: [LabCatalogService, LabOrderService, LabResultService],
})
export class LaboratoryModule {}
