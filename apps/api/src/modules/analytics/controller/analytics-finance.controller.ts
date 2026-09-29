import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsFinanceService } from '../service/analytics-finance.service';

/** The finance dashboard (P29-T08, PRD FR-FIN), behind `analytics.read-finance`. */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/finance' })
export class AnalyticsFinanceController {
  constructor(private readonly analyticsFinanceService: AnalyticsFinanceService) {}

  @Get()
  @Auth([{ action: 'read-finance', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Read the finance dashboard',
    responseDescription:
      "Revenue follows the invoice date: ISSUED and PAID invoices by `issuedAt` in clinic time, drafts and voided invoices never. Prices are tax-inclusive, so `taxAmount` is the PPN inside `revenue`. `cashReceived` and `breakdowns.paymentMethods` follow the payment date instead, counted exactly as `GET /reports/cashier-daily` counts them, so the two reconcile. Clinicians are credited through the invoice's encounter, as in the cashier report; a walk-in lab or inpatient bill is the unattributed row (`doctorId: null`). `payers` pairs each payer's visits with its revenue, `payerType: null` being a visit whose payer was never recorded. `outstanding` is every unpaid invoice now, whatever the range, by clinic days since issue (0–7, 8–30, over 30). `voidedInvoices` counts invoices voided in the range after they were issued. `specialtyId`, `doctorId` and `payerType` narrow every block. Amounts are rupiah, summed in integer cents; no patient or invoice number appears. `compare=true` adds `comparison` and `previousRevenue` per clinician and poli. Cached for five minutes; a query past ten seconds answers 503 `ANALYTICS_QUERY_TIMEOUT`.",
    responseExample: ANALYTICS_EXAMPLES.finance.response,
  })
  getFinance(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsFinanceService.getFinance(filter);
  }
}
