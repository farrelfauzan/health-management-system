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
      "`from` and `to` are the clinic's local dates, both included, at most 24 months apart. `compare=true` adds the comparison period: the previous calendar month for a whole month, otherwise the same number of days just before. `meta.generatedAt` is when the figures were read; answers are cached for five minutes. A query that runs past ten seconds answers 503 `ANALYTICS_QUERY_TIMEOUT`. Totals, series and breakdowns are filled in P29-T04.",
    responseExample: ANALYTICS_EXAMPLES.operations.response,
  })
  getOperations(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsOperationsService.getOperations(filter);
  }
}
