import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { EmrModule } from '../emr/emr.module';
import { AntenatalExaminationController } from './controller/antenatal-examination.controller';
import { PregnancyEpisodeController } from './controller/pregnancy-episode.controller';
import { MaternalCareRepository } from './repository/maternal-care.repository';
import { AntenatalExaminationService } from './service/antenatal-examination.service';
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
  // `ClinicalRequestDocumentModule` renders the two maternal letters (P25-T07)
  // through the same published-template → Gotenberg → object-storage path the
  // resep and the surat pengantar take, rather than growing a second renderer.
  imports: [AuthModule, ClinicalRequestDocumentModule, forwardRef(() => EmrModule)],
  controllers: [PregnancyEpisodeController, AntenatalExaminationController],
  providers: [MaternalCareRepository, MaternalCareService, AntenatalExaminationService],
  exports: [MaternalCareService],
})
export class MaternalCareModule {}
