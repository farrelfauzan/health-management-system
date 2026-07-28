import { Module } from '@nestjs/common';

import { SatusehatModule } from '../../common/satusehat/satusehat.module';
import { SatusehatLinkController } from './controller/satusehat-link.controller';
import { SatusehatLinkRepository } from './repository/satusehat-link.repository';
import { SatusehatLinkService } from './service/satusehat-link.service';

/**
 * Feature module for SATUSEHAT master-data linkage (P10-T02). Named
 * distinctly from the common {@link SatusehatModule} adapter it builds on;
 * the Phase 10 submission pipeline and ops surface land here too.
 */
@Module({
  imports: [SatusehatModule],
  controllers: [SatusehatLinkController],
  providers: [SatusehatLinkRepository, SatusehatLinkService],
})
export class SatusehatIntegrationModule {}
