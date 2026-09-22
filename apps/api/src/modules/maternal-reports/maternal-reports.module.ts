import { Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { MaternalReportsController } from './controller/maternal-reports.controller';
import { MaternalReportsRepository } from './repository/maternal-reports.repository';
import { MaternalReportsPdfService } from './service/maternal-reports-pdf.service';
import { MaternalReportsService } from './service/maternal-reports.service';

/**
 * The KIA registers and monthly reports (P25-T15, SJ-238). Its own module
 * rather than more controllers on `MaternalCareModule`: it only reads, it
 * joins laboratory, immunisation and admission rows the care module never
 * touches, and it has its own permission. `BillingModule` is imported for
 * `ClinicProfileService`, which owns the clinic's name and its reporting
 * puskesmas; `PdfModule` for the shared renderer.
 */
@Module({
  imports: [AuthModule, BillingModule, PdfModule],
  controllers: [MaternalReportsController],
  providers: [MaternalReportsRepository, MaternalReportsService, MaternalReportsPdfService],
})
export class MaternalReportsModule {}
