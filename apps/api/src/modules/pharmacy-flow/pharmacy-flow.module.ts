import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DispenseController } from './controller/dispense.controller';
import { MedicationController } from './controller/medication.controller';
import { InventoryController } from './controller/inventory.controller';
import { PrescriptionController } from './controller/prescription.controller';
import { PharmacyFlowRepository } from './repository/pharmacy-flow.repository';
import { PharmacyFlowService } from './service/pharmacy-flow.service';

@Module({
  imports: [AuthModule],
  controllers: [MedicationController, PrescriptionController, DispenseController, InventoryController],
  providers: [PharmacyFlowRepository, PharmacyFlowService],
})
export class PharmacyFlowModule {}
