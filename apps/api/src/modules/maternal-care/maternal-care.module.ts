import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DoctorManagementModule } from '../doctor-management/doctor-management.module';
import { ClinicalRequestDocumentModule } from '../clinical-request-document/clinical-request-document.module';
import { EmrModule } from '../emr/emr.module';
import { AntenatalExaminationController } from './controller/antenatal-examination.controller';
import { DeliveryRecordController } from './controller/delivery-record.controller';
import { FamilyPlanningController } from './controller/family-planning.controller';
import { PregnancyEpisodeController } from './controller/pregnancy-episode.controller';
import { DeliveryRecordRepository } from './repository/delivery-record.repository';
import { FamilyPlanningRepository } from './repository/family-planning.repository';
import { MaternalCareRepository } from './repository/maternal-care.repository';
import { AntenatalExaminationService } from './service/antenatal-examination.service';
import { DeliveryRecordService } from './service/delivery-record.service';
import { FamilyPlanningAuthorityService } from './service/family-planning-authority.service';
import { FamilyPlanningService } from './service/family-planning.service';
import { MaternalCareService } from './service/maternal-care.service';

/**
 * The midwife's maternal work: the pregnancy episode, K-visit numbering and
 * the trimester schedule (P25-T06), the 10T examination and its letters
 * (P25-T07), the birth that ends the pregnancy (P25-T09), and the family
 * planning course that often follows it (P25-T14).
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
  // `DoctorManagementModule` answers the KB IUD/implant gate (P25-T14): the
  // midwife's own authority and any mandate covering the method.
  imports: [
    AuthModule,
    ClinicalRequestDocumentModule,
    DoctorManagementModule,
    forwardRef(() => EmrModule),
  ],
  controllers: [
    PregnancyEpisodeController,
    AntenatalExaminationController,
    DeliveryRecordController,
    FamilyPlanningController,
  ],
  providers: [
    MaternalCareRepository,
    DeliveryRecordRepository,
    MaternalCareService,
    AntenatalExaminationService,
    DeliveryRecordService,
    FamilyPlanningRepository,
    FamilyPlanningAuthorityService,
    FamilyPlanningService,
  ],
  exports: [MaternalCareService],
})
export class MaternalCareModule {}
