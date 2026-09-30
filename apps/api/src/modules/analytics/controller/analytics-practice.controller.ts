import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { ANALYTICS_EXAMPLES } from '../../../common/openapi/analytics-examples';
import { AnalyticsFilterQueryDto } from '../dto/analytics-filter-query.dto';
import { AnalyticsPracticeService } from '../service/analytics-practice.service';

/**
 * "Praktik saya" (P29-T15, PRD FR-PRC), behind `analytics.read-practice`,
 * which DOCTOR and MIDWIFE hold with scope OWN: the practice shown is always
 * the caller's own.
 */
@ApiTags('Analytics')
@RequireFeature('analytics')
@Controller({ version: '1', path: 'analytics/my-practice' })
export class AnalyticsPracticeController {
  constructor(private readonly analyticsPracticeService: AnalyticsPracticeService) {}

  @Get()
  @Auth([{ action: 'read-practice', subject: 'Analytics' }])
  @ApiEndpoint({
    summary: "Read the signed-in clinician's own practice",
    responseDescription:
      "The signed-in doctor's or midwife's own practice, resolved from their clinician profile: `doctorId`, `specialtyId` and `payerType` in the query are ignored, so no colleague can be read. `finishedEncounters` are their finished encounters started in the range, per bucket in `series`; `medianConsultMinutes` is start to end, between 0 and 8 hours. Appointments scheduled in the range give `completedAppointments`, `noShowAppointments` and `noShowRatePercent` (no-shows over completed plus no-shows). `sessionUtilisationPercent` is appointments booked over the capacity of their capped sessions. `topDiagnoses` is their ten most frequent coded primary diagnoses, not suppressed, since every encounter behind them is their own. Answers 403 `ANALYTICS_NO_CLINICIAN_PROFILE` for a user with no clinician profile. Cached for five minutes per clinician.",
    responseExample: ANALYTICS_EXAMPLES.practice.response,
  })
  getMyPractice(@Query() filter: AnalyticsFilterQueryDto, @AuthUser() currentUser?: CurrentUser) {
    if (!currentUser) {
      throw new UnauthorizedException();
    }
    return this.analyticsPracticeService.getMyPractice(filter, currentUser.sub);
  }
}
