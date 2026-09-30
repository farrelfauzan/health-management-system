import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsPharmacyService } from '../service/analytics-pharmacy.service';

/**
 * The pharmacy dashboard (P29-T13, PRD FR-PHR), behind
 * `analytics.read-pharmacy`, which ADMIN and PHARMACIST hold. The class is
 * gated on `analytics`; the service refuses too when the pharmacy module is
 * off, since one route cannot carry two feature keys.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/pharmacy' })
export class AnalyticsPharmacyController {
  constructor(private readonly analyticsPharmacyService: AnalyticsPharmacyService) {}

  @Get()
  @Auth([{ action: 'read-pharmacy', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Read the pharmacy dashboard',
    responseDescription:
      "Prescriptions issued in the range under the status they have now: `fullyDispensed`, `partiallyDispensed`, `cancelled`, `awaitingDispense`, and `filledElsewhere` for those sent to an outside apotek, which add up to `prescriptionsIssued`. `fullyDispensedPercent` leaves the outside ones out. `medianDispenseMinutes` runs from issue to the first dispense that was not cancelled. `medicationRevenue` (rupiah) is the `MEDICATION` lines of issued and paid invoices by invoice date, the finance dashboard's figure. `topMedications` is the twenty catalog medications with the most units handed over in the range. `stock` is now and ignores every filter: `reorder` lists medications at or below their reorder level by the stock page's rule (batches not yet expired), fewest days of cover first, at most fifty, with `reorderCount` counting them all; `expiring` counts batches with stock left that have expired or expire within 30, 60 and 90 days, by the expiry report's rule. `doctorId` narrows by prescriber; `specialtyId` and `payerType` by the visit the prescription was written in. Answers 403 `FEATURE_DISABLED` when the pharmacy module is off. Cached for five minutes; a query past ten seconds answers 503 `ANALYTICS_QUERY_TIMEOUT`.",
    responseExample: ANALYTICS_EXAMPLES.pharmacy.response,
  })
  getPharmacy(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsPharmacyService.getPharmacy(filter);
  }
}
