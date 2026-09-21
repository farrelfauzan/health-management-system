import { Module } from '@nestjs/common';

import { SatusehatModule } from '../../common/satusehat/satusehat.module';
import { DoctorManagementModule } from '../doctor-management/doctor-management.module';
import { SatusehatLinkController } from './controller/satusehat-link.controller';
import { SatusehatLocationController } from './controller/satusehat-location.controller';
import { SatusehatRecordController } from './controller/satusehat-record.controller';
import { SatusehatSubmissionController } from './controller/satusehat-submission.controller';
import { SatusehatLinkRepository } from './repository/satusehat-link.repository';
import { SatusehatLocationRepository } from './repository/satusehat-location.repository';
import { SatusehatPostnatalRepository } from './repository/satusehat-postnatal.repository';
import { SatusehatSubmissionRepository } from './repository/satusehat-submission.repository';
import { SatusehatLinkService } from './service/satusehat-link.service';
import { SatusehatLocationRegistrationService } from './service/satusehat-location-registration.service';
import { SatusehatLocationTreeService } from './service/satusehat-location-tree.service';
import { SatusehatRecordComparisonService } from './service/satusehat-record-comparison.service';
import { SatusehatSubmissionOpsService } from './service/satusehat-submission-ops.service';
import { SatusehatSubmissionDetailService } from './service/satusehat-submission-detail.service';
import { SatusehatPostnatalSubmissionService } from './service/satusehat-postnatal-submission.service';
import { SatusehatSubmissionService } from './service/satusehat-submission.service';
import { SatusehatSubmissionWorker } from './service/satusehat-submission.worker';

/**
 * Feature module for SATUSEHAT master-data linkage (P10-T02), the submission
 * pipeline (P10-T04), the admin ops surface over the outbox (P10-T06), and the
 * treating doctor's comparison with what SATUSEHAT holds (P21-T04), and the
 * clinic's Location tree registration (P24-T06).
 * Named distinctly from the common {@link SatusehatModule} adapter it builds
 * on. Outbox rows are created by the EMR close transaction — this module only
 * ever consumes them.
 */
@Module({
  // DoctorManagementModule for `resolveOwnDoctorProfileId`: the record
  // comparison (P21-T04) uses the same "which profile is mine" rule as the
  // doctor's own profile page. Nothing there imports this module back.
  imports: [SatusehatModule, DoctorManagementModule],
  controllers: [
    SatusehatLinkController,
    SatusehatSubmissionController,
    SatusehatRecordController,
    SatusehatLocationController,
  ],
  providers: [
    SatusehatLinkRepository,
    SatusehatSubmissionRepository,
    SatusehatPostnatalRepository,
    SatusehatLinkService,
    SatusehatSubmissionService,
    SatusehatPostnatalSubmissionService,
    SatusehatSubmissionOpsService,
    SatusehatSubmissionDetailService,
    SatusehatRecordComparisonService,
    SatusehatSubmissionWorker,
    SatusehatLocationRepository,
    SatusehatLocationTreeService,
    SatusehatLocationRegistrationService,
  ],
})
export class SatusehatIntegrationModule {}
