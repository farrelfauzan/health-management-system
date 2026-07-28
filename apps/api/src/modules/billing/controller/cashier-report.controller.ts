import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BILLING_EXAMPLES } from '../../../common/openapi/billing-examples';
import { CashierDailyReportQueryDto } from '../dto/cashier-daily-report-query.dto';
import { CashierReportService } from '../service/cashier-report.service';

@ApiTags('Reports')
@Controller({
  version: '1',
  path: 'reports/cashier-daily',
})
export class CashierReportController {
  constructor(private readonly cashierReportService: CashierReportService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Invoice' }])
  @ApiEndpoint({
    summary: 'Daily cashier report',
    responseDescription:
      "One clinic day at the cash drawer: settled totals split by payment method and by doctor. Defaults to the clinic's today; unpaid and voided invoices never appear.",
    responseExample: { data: BILLING_EXAMPLES.cashierReport },
  })
  async getDailyReport(@Query() query: CashierDailyReportQueryDto) {
    const report = await this.cashierReportService.getDailyReport(query);

    return {
      data: report,
    };
  }
}
