import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsLaboratoryService } from '../service/analytics-laboratory.service';

/**
 * The laboratory dashboard (P29-T14, PRD FR-LAB), behind
 * `analytics.read-lab`, which ADMIN and LAB_TECHNICIAN hold. The class is
 * gated on `analytics`; the service refuses too when the laboratory module
 * is off, since one route cannot carry two feature keys.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/laboratory' })
export class AnalyticsLaboratoryController {
  constructor(private readonly analyticsLaboratoryService: AnalyticsLaboratoryService) {}

  @Get()
  @Auth([{ action: 'read-lab', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Read the laboratory dashboard',
    responseDescription:
      "Lab orders placed in the range under the status they have now: `released`, `inProgress` (ordered, collected, being run or resulted, not yet released), `sentOut` (run by an outside lab, never released here) and `cancelled`, which add up to `orders`. Turnaround is order to release over released orders, median and p90 in whole minutes. `recollectedOrders` are orders whose sample was taken again; the recollection rate is over orders run here, the cancellation rate over every order. `sources` counts orders from an encounter, a walk-in and an external referral. `tests` is the ten tests on the most orders that were not cancelled, each with the turnaround of the orders it was on (`null` until one is released). `doctorId` narrows by the ordering clinician; `specialtyId` and `payerType` by the order's registration. Answers 403 `FEATURE_DISABLED` when the laboratory module is off. Cached for five minutes; a query past ten seconds answers 503 `ANALYTICS_QUERY_TIMEOUT`.",
    responseExample: ANALYTICS_EXAMPLES.laboratory.response,
  })
  getLaboratory(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsLaboratoryService.getLaboratory(filter);
  }
}
