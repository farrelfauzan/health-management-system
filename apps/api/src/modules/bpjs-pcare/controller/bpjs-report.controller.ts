import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { MonthlyBpjsReportQueryDto } from '../dto/monthly-bpjs-report-query.dto';
import { BpjsReportService } from '../service/bpjs-report.service';

@ApiTags('BPJS PCare')
@Controller({
  version: '1',
  path: 'bpjs/reports',
})
export class BpjsReportController {
  constructor(private readonly reportService: BpjsReportService) {}

  @Get('monthly')
  @Auth([{ action: 'read', subject: 'BpjsSubmission' }])
  @ApiEndpoint({
    summary: 'Monthly BPJS reconciliation report (tercatat vs terkirim vs gagal)',
    responseDescription:
      'Per-type submission counts for JKN visits in the given calendar month — recorded, submitted, still pending, failed — plus the failed rows (capped at 100, newest first) to chase before the BPJS claim deadline closes.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.monthlyReport },
  })
  async getMonthlyReport(
    @Query() query: MonthlyBpjsReportQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const report = await this.reportService.getMonthlyReport(query);

    return { data: report };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
