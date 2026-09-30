import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsCaseMixService } from '../service/analytics-case-mix.service';

/**
 * The case-mix dashboard (P29-T12, PRD FR-CLN), behind
 * `analytics.read-clinical`, which SUPER_ADMIN is not given (D-033). The PO
 * answered Q-1 on 2026-09-30: ADMIN may see it, as statistics that cannot
 * point at a patient.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/case-mix' })
export class AnalyticsCaseMixController {
  constructor(private readonly analyticsCaseMixService: AnalyticsCaseMixService) {}

  @Get()
  @Auth([{ action: 'read-clinical', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: 'Read the case-mix dashboard',
    responseDescription:
      "Finished encounters started in the range (cancelled ones never count) and how completely they are coded: an encounter is coded when its primary diagnosis carries an ICD-10 code. `topDiagnoses` is the ten most frequent coded primary diagnoses, then one `OTHER` row for every code below them (`otherCodes` says how many) and one `UNCODED` row, so the list adds up to `finishedEncounters`. `groups` does the same by the code's first letter, five groups deep. `codingByPoli` gives each poli's finished and uncoded encounters. `topProcedures` ranks ICD-9-CM procedures done in those encounters. Every clinical count from 1 to 4 is withheld as `{ suppressed: true }`, together with the next smallest when only one would be hidden, and its share is `null`. Totals are exact. `specialtyId`, `doctorId` and `payerType` narrow every block. No patient, encounter id or free text appears. Cached for five minutes; a query past ten seconds answers 503 `ANALYTICS_QUERY_TIMEOUT`.",
    responseExample: ANALYTICS_EXAMPLES.caseMix.response,
  })
  getCaseMix(@Query() filter: AnalyticsFilterQueryDto) {
    return this.analyticsCaseMixService.getCaseMix(filter);
  }
}
