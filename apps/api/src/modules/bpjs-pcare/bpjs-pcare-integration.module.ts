import { Module } from '@nestjs/common';

import { BpjsPcareModule } from '../../common/bpjs-pcare/bpjs-pcare.module';
import { BpjsAntreanIntegrationModule } from '../bpjs-antrean/bpjs-antrean-integration.module';
import { BpjsEligibilityController } from './controller/bpjs-eligibility.controller';
import { BpjsMappingController } from './controller/bpjs-mapping.controller';
import { BpjsPcareConfigController } from './controller/bpjs-pcare-config.controller';
import { BpjsReferenceController } from './controller/bpjs-reference.controller';
import { BpjsReportController } from './controller/bpjs-report.controller';
import { BpjsSubmissionController } from './controller/bpjs-submission.controller';
import { BpjsEligibilityRepository } from './repository/bpjs-eligibility.repository';
import { BpjsMappingRepository } from './repository/bpjs-mapping.repository';
import { BpjsPcareConfigRepository } from './repository/bpjs-pcare-config.repository';
import { BpjsReferenceRepository } from './repository/bpjs-reference.repository';
import { BpjsSubmissionRepository } from './repository/bpjs-submission.repository';
import { BpjsEligibilityService } from './service/bpjs-eligibility.service';
import { BpjsMappingService } from './service/bpjs-mapping.service';
import { BpjsPcareConfigService } from './service/bpjs-pcare-config.service';
import { BpjsReferenceService } from './service/bpjs-reference.service';
import { BpjsReportService } from './service/bpjs-report.service';
import { BpjsSubmissionOpsService } from './service/bpjs-submission-ops.service';
import { BpjsSubmissionService } from './service/bpjs-submission.service';
import { BpjsSubmissionWorker } from './service/bpjs-submission.worker';

/**
 * Feature module for BPJS PCare bridging (P11-T02: credential configuration
 * and connection testing; P11-T03: reference-catalog sync and the
 * doctor/poli/DPHO mapping surfaces; P11-T04: the eligibility check at
 * registration check-in; P11-T05: the submission outbox, worker, and ops
 * surface; the rujukan flow of P11-T06 lands here). Named distinctly from
 * the common {@link BpjsPcareModule} adapter it builds on.
 */
@Module({
  imports: [BpjsPcareModule, BpjsAntreanIntegrationModule],
  controllers: [
    BpjsPcareConfigController,
    BpjsReferenceController,
    BpjsMappingController,
    BpjsEligibilityController,
    BpjsSubmissionController,
    BpjsReportController,
  ],
  providers: [
    BpjsPcareConfigRepository,
    BpjsPcareConfigService,
    BpjsReferenceRepository,
    BpjsReferenceService,
    BpjsMappingRepository,
    BpjsMappingService,
    BpjsEligibilityRepository,
    BpjsEligibilityService,
    BpjsSubmissionRepository,
    BpjsSubmissionService,
    BpjsSubmissionOpsService,
    BpjsSubmissionWorker,
    BpjsReportService,
  ],
  // The inbound Antrean surface (P14-T04) resolves BPJS poli and doctor codes
  // through the mapping service rather than reading the columns itself.
  exports: [BpjsMappingService],
})
export class BpjsPcareIntegrationModule {}
