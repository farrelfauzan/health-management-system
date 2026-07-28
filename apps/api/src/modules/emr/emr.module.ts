import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TerminologyModule } from '../terminology/terminology.module';
import { EncounterClinicalDataController } from './controller/encounter-clinical-data.controller';
import { EncounterController } from './controller/encounter.controller';
import { EncounterRepository } from './repository/encounter.repository';
import { EncounterAccessService } from './service/encounter-access.service';
import { EncounterClinicalDataService } from './service/encounter-clinical-data.service';
import { EncounterMapper } from './service/encounter.mapper';
import { EncounterService } from './service/encounter.service';

@Module({
  imports: [AuthModule, TerminologyModule],
  controllers: [EncounterController, EncounterClinicalDataController],
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
