import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { DispenseController } from './controller/dispense.controller';
import { MedicationController } from './controller/medication.controller';
import { InventoryController } from './controller/inventory.controller';
import { PrescriptionController } from './controller/prescription.controller';
import { PharmacyFlowRepository } from './repository/pharmacy-flow.repository';
import { PharmacyFlowService } from './service/pharmacy-flow.service';

@Module({
  // P18-T12: the resep is rendered by the module that owns printing, from a
  // context this module gathers, and its letterhead is the clinic profile
  // billing already owns. Neither imports this one back.
  imports: [AuthModule, BillingModule, ClinicalRequestDocumentModule],
  controllers: [MedicationController, PrescriptionController, DispenseController, InventoryController],
  providers: [PharmacyFlowRepository, PharmacyFlowService],
  // The service only — the AI chatbot's pharmacy tools (P15-T05) call it as
  // the asking user, exactly as this module's controllers do. Cross-module
  // access never reaches the repository.
  exports: [PharmacyFlowService],
})
export class PharmacyFlowModule {}
