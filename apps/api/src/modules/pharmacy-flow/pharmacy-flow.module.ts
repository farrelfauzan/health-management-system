import { Module } from '@nestjs/common';

import { SatusehatModule } from '../../common/satusehat/satusehat.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { DoctorManagementModule } from '../doctor-management/doctor-management.module';
import { KfaLookupService } from './service/kfa-lookup.service';
import { MidwifeFormularyService } from './service/midwife-formulary.service';
import { DispenseController } from './controller/dispense.controller';
import { MedicationController } from './controller/medication.controller';
import { InventoryController } from './controller/inventory.controller';
import { PrescriptionController } from './controller/prescription.controller';
import { MidwifeFormularyRepository } from './repository/midwife-formulary.repository';
import { PharmacyFlowRepository } from './repository/pharmacy-flow.repository';
import { PharmacyFlowService } from './service/pharmacy-flow.service';

@Module({
  // P18-T12: the resep is rendered by the module that owns printing, from a
  // context this module gathers, and its letterhead is the clinic profile
  // billing already owns. Neither imports this one back.
  // SatusehatModule for the KFA product lookup the catalog form searches: the
  // national code is the platform's, so the platform is what answers for it.
  // DoctorManagementModule for the midwife authority behind an AUTHORITY_BOUND
  // medicine (P25-T05): who holds which kewenangan is that module's to answer,
  // and this one asks its service rather than reading its tables.
  imports: [
    AuthModule,
    BillingModule,
    ClinicalRequestDocumentModule,
    DoctorManagementModule,
    SatusehatModule,
  ],
  controllers: [
    MedicationController,
    PrescriptionController,
    DispenseController,
    InventoryController,
  ],
  providers: [
    PharmacyFlowRepository,
    PharmacyFlowService,
    KfaLookupService,
    MidwifeFormularyRepository,
    MidwifeFormularyService,
  ],
  // The service only — the AI chatbot's pharmacy tools (P15-T05) call it as
  // the asking user, exactly as this module's controllers do. Cross-module
  // access never reaches the repository.
  exports: [PharmacyFlowService],
})
export class PharmacyFlowModule {}
