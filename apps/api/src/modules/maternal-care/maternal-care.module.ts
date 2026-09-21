import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { EmrModule } from '../emr/emr.module';
import { NotificationModule } from '../notification/notification.module';
import { AntenatalExaminationController } from './controller/antenatal-examination.controller';
import { DeliveryRecordController } from './controller/delivery-record.controller';
import { PostnatalVisitController } from './controller/postnatal-visit.controller';
import { PregnancyEpisodeController } from './controller/pregnancy-episode.controller';
import { ShkScreeningController } from './controller/shk-screening.controller';
import { DeliveryRecordRepository } from './repository/delivery-record.repository';
import { MaternalCareRepository } from './repository/maternal-care.repository';
import { PostnatalVisitRepository } from './repository/postnatal-visit.repository';
import { AntenatalExaminationService } from './service/antenatal-examination.service';
import { DeliveryRecordService } from './service/delivery-record.service';
import { MaternalCareService } from './service/maternal-care.service';
import { PostnatalEpisodeCloseService } from './service/postnatal-episode-close.service';
import { PostnatalEpisodeCloseWorker } from './service/postnatal-episode-close.worker';
import { PostnatalVisitService } from './service/postnatal-visit.service';
import { ShkScreeningRepository } from './repository/shk-screening.repository';
import { ShkRecallNotificationService } from './service/shk-recall-notification.service';
import { ShkScreeningService } from './service/shk-screening.service';

/**
 * The midwife's maternal work: the pregnancy episode, K-visit numbering and
 * the trimester schedule (P25-T06), the 10T examination and its letters
 * (P25-T07), the birth that ends the pregnancy (P25-T09), the baby's SHK
 * screening that follows it (P25-T10), and the nifas and neonatal visits
 * after it (P25-T12).
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
  imports: [
    AuthModule,
    ClinicalRequestDocumentModule,
    NotificationModule,
    forwardRef(() => EmrModule),
  ],
  controllers: [
    PregnancyEpisodeController,
    AntenatalExaminationController,
    DeliveryRecordController,
    PostnatalVisitController,
    ShkScreeningController,
  ],
  providers: [
    MaternalCareRepository,
    DeliveryRecordRepository,
    MaternalCareService,
    AntenatalExaminationService,
    DeliveryRecordService,
    PostnatalVisitRepository,
    PostnatalVisitService,
    PostnatalEpisodeCloseService,
    PostnatalEpisodeCloseWorker,
    ShkScreeningRepository,
    ShkScreeningService,
    ShkRecallNotificationService,
  ],
  exports: [MaternalCareService],
})
export class MaternalCareModule {}
