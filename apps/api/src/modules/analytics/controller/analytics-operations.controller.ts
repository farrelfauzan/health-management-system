import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsOperationsService } from '../service/analytics-operations.service';

/**
 * The operations dashboard (P29, PRD FR-OPS). One controller per dashboard,
 * each behind its own `analytics.read-*` key, so a role can be given one
 * dashboard without the others.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/operations' })
export class AnalyticsOperationsController {
  constructor(private readonly analyticsOperationsService: AnalyticsOperationsService) {}

  @Get()
  @Auth([{ action: 'read-operations', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Read the operations dashboard',
    responseDescription:
      "Visits (registrations checked in or completed) by clinic day or week or month and by type; new patients (first visit ever in the range) against returning; visits per poli and per clinician; appointment outcomes; and booking channel with its no-show rate (NO_SHOW / (COMPLETED + NO_SHOW)). `from` and `to` are the clinic's local dates, both included, at most 24 months apart. `specialtyId` and `doctorId` narrow every block; `payerType` narrows the visit figures only: appointments, practice sessions and admissions record no payer, and a visit whose payer was never recorded matches no payer. `compare=true` adds `comparison` (previous calendar month for a whole month, otherwise the same number of days just before) and `previousVisits` on each poli and clinician. Counts only: no patient appears in the payload. `meta.generatedAt` is when the figures were read; answers are cached for five minutes. A query past ten seconds answers 503 `ANALYTICS_QUERY_TIMEOUT`.",
    responseExample: ANALYTICS_EXAMPLES.operations.response,
  })
  getOperations(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsOperationsService.getOperations(filter);
  }

  @Get('today')
  @Auth([{ action: 'read-operations', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Count visits so far today against the same weekday last week',
    responseDescription:
      "For the home dashboard (P29-T16). `visits` counts visits (registrations checked in or completed) that arrived today in the clinic's time zone up to now; `comparisonVisits` counts those that arrived on the same weekday a week earlier up to the same clock time. A visit arrives when it is checked in, or when it was registered if it never was, so both days are cut the same way. `changePercent` is one decimal, `null` when last week had none by then. Not cached.",
    responseExample: ANALYTICS_EXAMPLES.visitsToday.response,
  })
  getVisitsToday() {
    return this.analyticsOperationsService.getVisitsToday();
  }
}
