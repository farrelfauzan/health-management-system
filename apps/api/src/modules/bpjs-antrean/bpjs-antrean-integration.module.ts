import { Module } from '@nestjs/common';

import { BpjsAntreanModule } from '../../common/bpjs-antrean/bpjs-antrean.module';
import { BpjsAntreanConfigController } from './controller/bpjs-antrean-config.controller';
import { BpjsAntreanConfigRepository } from './repository/bpjs-antrean-config.repository';
import { BpjsAntreanReconciliationRepository } from './repository/bpjs-antrean-reconciliation.repository';
import { BpjsAntreanConfigService } from './service/bpjs-antrean-config.service';
import { BpjsAntreanReconciliationService } from './service/bpjs-antrean-reconciliation.service';
import { BpjsAntreanSubmissionService } from './service/bpjs-antrean-submission.service';

/**
 * Feature module for BPJS Antrean Online (Mobile JKN) bridging (P14-T03:
 * credential configuration and connection testing). The inbound web service
 * BPJS calls (P14-T04) and the outbound publishing of queue entries and
 * service progress (P14-T05) land here as they are built.
 *
 * Kept separate from {@link BpjsPcareIntegrationModule} rather than folded
 * into it: the two integrations carry separately issued, separately revoked
 * credentials, and a clinic can run PCare bridging with no antrean at all
 * (ADR D-023). Named distinctly from the common {@link BpjsAntreanModule}
 * adapter it builds on.
 */
@Module({
  imports: [BpjsAntreanModule],
  controllers: [BpjsAntreanConfigController],
  providers: [
    BpjsAntreanConfigRepository,
    BpjsAntreanReconciliationRepository,
    BpjsAntreanConfigService,
    BpjsAntreanSubmissionService,
    BpjsAntreanReconciliationService,
  ],
  // The inbound web service (P14-T04) verifies BPJS's credentials through this
  // service; the stored hash never leaves the repository behind it.
  exports: [BpjsAntreanConfigService, BpjsAntreanSubmissionService],
})
export class BpjsAntreanIntegrationModule {}
