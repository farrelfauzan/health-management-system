import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PharmacyFlowModule } from '../pharmacy-flow/pharmacy-flow.module';
import { TerminologyModule } from '../terminology/terminology.module';
import { EncounterClinicalDataController } from './controller/encounter-clinical-data.controller';
import { EncounterController } from './controller/encounter.controller';
import { PatientImmunizationController } from './controller/patient-immunization.controller';
import { EncounterRepository } from './repository/encounter.repository';
import { EncounterAccessService } from './service/encounter-access.service';
import { EncounterClinicalDataService } from './service/encounter-clinical-data.service';
import { EncounterMapper } from './service/encounter.mapper';
import { EncounterService } from './service/encounter.service';

@Module({
  // PharmacyFlowModule for the vaccine lookup behind P10-T16: vaccines are KFA
  // products and live in the medication catalog, so the check goes through
  // that module's service rather than into its repository.
  imports: [AuthModule, TerminologyModule, PharmacyFlowModule],
  controllers: [
    EncounterController,
    EncounterClinicalDataController,
    PatientImmunizationController,
  ],
  providers: [
    EncounterRepository,
    EncounterAccessService,
    EncounterMapper,
    EncounterService,
    EncounterClinicalDataService,
  ],
  exports: [EncounterService],
})
export class EmrModule {}
