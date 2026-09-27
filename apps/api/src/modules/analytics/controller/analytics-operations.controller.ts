import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
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
      '`asOf` is the instant the figures were read. Visits, poli and doctor, appointment outcomes and booking channel join this response in P29-T04.',
    responseExample: { data: ANALYTICS_EXAMPLES.operations.view },
  })
  getOperations() {
    return { data: this.analyticsOperationsService.getOperationsView() };
  }
}
