import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { EmrModule } from '../emr/emr.module';
import { AntenatalExaminationController } from './controller/antenatal-examination.controller';
import { DeliveryRecordController } from './controller/delivery-record.controller';
import { PregnancyEpisodeController } from './controller/pregnancy-episode.controller';
import { DeliveryRecordRepository } from './repository/delivery-record.repository';
import { MaternalCareRepository } from './repository/maternal-care.repository';
import { AntenatalExaminationService } from './service/antenatal-examination.service';
import { DeliveryRecordService } from './service/delivery-record.service';
import { MaternalCareService } from './service/maternal-care.service';

/**
 * The midwife's maternal work: the pregnancy episode, K-visit numbering and
 * the trimester schedule (P25-T06), the 10T examination and its letters
 * (P25-T07), and the birth that ends the pregnancy (P25-T09).
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
  controllers: [
    PregnancyEpisodeController,
    AntenatalExaminationController,
    DeliveryRecordController,
  ],
  providers: [
    MaternalCareRepository,
    DeliveryRecordRepository,
    MaternalCareService,
    AntenatalExaminationService,
    DeliveryRecordService,
  ],
  exports: [MaternalCareService],
})
export class MaternalCareModule {}
