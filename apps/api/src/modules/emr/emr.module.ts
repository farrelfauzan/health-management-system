import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorManagementModule } from '../doctor-management/doctor-management.module';
import { LaboratoryModule } from '../laboratory/laboratory.module';
import { MaternalCareModule } from '../maternal-care/maternal-care.module';
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
import { MidwifeAuthorityEnforcementService } from './service/midwife-authority-enforcement.service';

@Module({
  // PharmacyFlowModule for the vaccine lookup behind P10-T16: vaccines are KFA
  // products and live in the medication catalog, so the check goes through
  // that module's service rather than into its repository.
  // LaboratoryModule for P18-T02: the encounter record shows the lab work
  // raised on the visit, and closing names what is still outstanding. The
  // dependency runs one way — the laboratory reads the encounter row it needs
  // from its own repository, so nothing here is circular.
  // DoctorManagementModule for P25-T03: a midwife's procedures and under-five
  // visits are checked against her delegated authorities through
  // `DoctorAuthorityService`, never its repository. Nothing in that module
  // imports this one, so the edge needs no forwardRef.
  imports: [
    AuthModule,
    TerminologyModule,
    PharmacyFlowModule,
    LaboratoryModule,
    DoctorManagementModule,
    // `forwardRef` because P25-T06 genuinely runs both ways: a pregnancy
    // episode is a view over encounters and reads this module's access rules,
    // while closing an encounter has to freeze the K-code onto the visit it
    // counts as. Both edges go through services, never the other module's
    // repository.
    forwardRef(() => MaternalCareModule),
  ],
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
    MidwifeAuthorityEnforcementService,
  ],
  // `EncounterAccessService` and the encounter lookup are exported for
  // P25-T06: a pregnancy episode is a view over encounters, so it reuses this
  // module's access rules rather than inventing a second own-scope rule.
  exports: [EncounterService, EncounterAccessService],
})
export class EmrModule {}
