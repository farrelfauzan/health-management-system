import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsReportingHealthService } from '../service/analytics-reporting-health.service';

/**
 * The reporting status page (P29-T06, PRD FR-INT). Read with the operations
 * key: whether data reached SATUSEHAT and BPJS is the clinic's day-to-day,
 * not money and not a patient.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/reporting-health' })
export class AnalyticsReportingHealthController {
  constructor(private readonly analyticsReportingHealthService: AnalyticsReportingHealthService) {}

  @Get()
  @Auth([{ action: 'read-operations', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Read the reporting status',
    responseDescription:
      "SATUSEHAT submissions per kind and BPJS submissions per type: `submitted` counts what arrived between `from` and `to`; `pending` and `failed` are what is outstanding now, whatever the range, and `oldestPendingAt` is when the oldest pending one was queued. `bpjs` is null when neither BPJS feature is on. `readiness` counts the range's finished visits that cannot be reported yet: no primary diagnosis, or a clinician without a NIK. Failure text is never included — it can quote patient data — so each failed count is meant to link to the submission list. Only `from` and `to` apply; `compare`, poli, clinician and payer are ignored. Cached for five minutes.",
    responseExample: ANALYTICS_EXAMPLES.reportingHealth.response,
  })
  getReportingHealth(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsReportingHealthService.getReportingHealth(filter);
  }
}
