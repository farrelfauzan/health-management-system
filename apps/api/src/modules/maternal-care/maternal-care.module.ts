import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EmrModule } from '../emr/emr.module';
import { PregnancyEpisodeController } from './controller/pregnancy-episode.controller';
import { MaternalCareRepository } from './repository/maternal-care.repository';
import { MaternalCareService } from './service/maternal-care.service';

/**
 * The midwife's antenatal work (P25-T06): the pregnancy episode, K-visit
 * numbering and the trimester schedule.
 *
 * `EmrModule` is imported for `EncounterAccessService` and the encounter
 * lookup, because an episode is a view over encounters and must not invent a
 * second own-scope rule. The dependency runs one way: EMR knows nothing about
 * pregnancies, and the code freeze at encounter close reaches this module
 * through its service.
 */
@Module({
  imports: [AuthModule, forwardRef(() => EmrModule)],
  controllers: [PregnancyEpisodeController],
  providers: [MaternalCareRepository, MaternalCareService],
  exports: [MaternalCareService],
})
export class MaternalCareModule {}
