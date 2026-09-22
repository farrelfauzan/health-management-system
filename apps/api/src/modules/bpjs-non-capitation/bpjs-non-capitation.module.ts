import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { BpjsNonCapitationRecapController } from './controller/bpjs-non-capitation-recap.controller';
import { BpjsNonCapitationSettingsController } from './controller/bpjs-non-capitation-settings.controller';
import { BpjsNonCapitationConfigRepository } from './repository/bpjs-non-capitation-config.repository';
import { BpjsNonCapitationRecapRepository } from './repository/bpjs-non-capitation-recap.repository';
import { BpjsNonCapitationPdfService } from './service/bpjs-non-capitation-pdf.service';
import { BpjsNonCapitationRecapService } from './service/bpjs-non-capitation-recap.service';
import { BpjsNonCapitationSettingsService } from './service/bpjs-non-capitation-settings.service';

/**
 * The BPJS bidan jejaring non-capitation recap (P25-T16, SJ-239). Its own
 * module rather than more of `BpjsPcareIntegrationModule`: it holds no PCare
 * credential, calls no BPJS endpoint and reads the maternal-care records the
 * PCare module never touches (D-043). `BillingModule` is imported for the
 * clinic's name and letterhead, `PdfModule` for the shared renderer.
 */
@Module({
  imports: [AuthModule, BillingModule, PdfModule],
  controllers: [BpjsNonCapitationRecapController, BpjsNonCapitationSettingsController],
  providers: [
    BpjsNonCapitationRecapRepository,
    BpjsNonCapitationConfigRepository,
    BpjsNonCapitationRecapService,
    BpjsNonCapitationSettingsService,
    BpjsNonCapitationPdfService,
  ],
})
export class BpjsNonCapitationModule {}
