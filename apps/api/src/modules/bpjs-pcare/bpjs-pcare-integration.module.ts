import { Module } from '@nestjs/common';

import { BpjsPcareModule } from '../../common/bpjs-pcare/bpjs-pcare.module';
import { BpjsPcareConfigController } from './controller/bpjs-pcare-config.controller';
import { BpjsPcareConfigRepository } from './repository/bpjs-pcare-config.repository';
import { BpjsPcareConfigService } from './service/bpjs-pcare-config.service';

/**
 * Feature module for BPJS PCare bridging (P11-T02: credential configuration
 * and connection testing; the reference-data sync, eligibility, and
 * submission pipeline of P11-T03..T06 land here). Named distinctly from the
 * common {@link BpjsPcareModule} adapter it builds on.
 */
@Module({
  imports: [BpjsPcareModule],
  controllers: [BpjsPcareConfigController],
  providers: [BpjsPcareConfigRepository, BpjsPcareConfigService],
})
export class BpjsPcareIntegrationModule {}
