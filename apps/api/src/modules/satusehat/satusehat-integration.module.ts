import { Module } from '@nestjs/common';

import { SatusehatModule } from '../../common/satusehat/satusehat.module';
import { SatusehatLinkController } from './controller/satusehat-link.controller';
import { SatusehatLinkRepository } from './repository/satusehat-link.repository';
import { SatusehatSubmissionRepository } from './repository/satusehat-submission.repository';
import { SatusehatLinkService } from './service/satusehat-link.service';
import { SatusehatSubmissionService } from './service/satusehat-submission.service';
import { SatusehatSubmissionWorker } from './service/satusehat-submission.worker';

/**
 * Feature module for SATUSEHAT master-data linkage (P10-T02) and the
 * submission pipeline (P10-T04). Named distinctly from the common
 * {@link SatusehatModule} adapter it builds on; the ops surface (P10-T06)
 * lands here too. Outbox rows are created by the EMR close transaction — this
 * module only ever consumes them.
 */
@Module({
  imports: [SatusehatModule],
  controllers: [SatusehatLinkController],
  providers: [
    SatusehatLinkRepository,
    SatusehatSubmissionRepository,
    SatusehatLinkService,
    SatusehatSubmissionService,
    SatusehatSubmissionWorker,
  ],
})
export class SatusehatIntegrationModule {}
