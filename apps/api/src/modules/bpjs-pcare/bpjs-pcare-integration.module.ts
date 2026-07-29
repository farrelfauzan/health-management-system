import { Module } from '@nestjs/common';

import { BpjsPcareModule } from '../../common/bpjs-pcare/bpjs-pcare.module';
import { BpjsMappingController } from './controller/bpjs-mapping.controller';
import { BpjsPcareConfigController } from './controller/bpjs-pcare-config.controller';
import { BpjsReferenceController } from './controller/bpjs-reference.controller';
import { BpjsMappingRepository } from './repository/bpjs-mapping.repository';
import { BpjsPcareConfigRepository } from './repository/bpjs-pcare-config.repository';
import { BpjsReferenceRepository } from './repository/bpjs-reference.repository';
import { BpjsMappingService } from './service/bpjs-mapping.service';
import { BpjsPcareConfigService } from './service/bpjs-pcare-config.service';
import { BpjsReferenceService } from './service/bpjs-reference.service';

/**
 * Feature module for BPJS PCare bridging (P11-T02: credential configuration
 * and connection testing; P11-T03: reference-catalog sync and the
 * doctor/poli/DPHO mapping surfaces; the eligibility and submission pipeline
 * of P11-T04..T06 land here). Named distinctly from the common
 * {@link BpjsPcareModule} adapter it builds on.
 */
@Module({
  imports: [BpjsPcareModule],
  controllers: [BpjsPcareConfigController, BpjsReferenceController, BpjsMappingController],
  providers: [
    BpjsPcareConfigRepository,
    BpjsPcareConfigService,
    BpjsReferenceRepository,
    BpjsReferenceService,
    BpjsMappingRepository,
    BpjsMappingService,
  ],
})
export class BpjsPcareIntegrationModule {}
