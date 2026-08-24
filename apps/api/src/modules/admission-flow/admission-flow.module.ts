import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RoomManagementModule } from '../room-management/room-management.module';
import { AdmissionFlowController } from './controller/admission-flow.controller';
import { AdmissionFlowRepository } from './repository/admission-flow.repository';
import { AdmissionReferenceRepository } from './repository/admission-reference.repository';
import { AdmissionAccessService } from './service/admission-access.service';
import { AdmissionFlowService } from './service/admission-flow.service';
import { AdmissionMapper } from './service/admission.mapper';

@Module({
  // `RoomManagementModule` exports `BedService`: bed availability is read
  // through the service that owns the inventory rules, never through that
  // module's repositories.
  imports: [AuthModule, RoomManagementModule],
  controllers: [AdmissionFlowController],
  providers: [
    AdmissionFlowRepository,
    AdmissionReferenceRepository,
    AdmissionAccessService,
    AdmissionMapper,
    AdmissionFlowService,
  ],
  // Exported for IMP-15: room charges are priced from the stay's bed history
  // at discharge.
  exports: [AdmissionFlowService, AdmissionFlowRepository],
})
export class AdmissionFlowModule {}
