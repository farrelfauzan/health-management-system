import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsPracticeData,
  AnalyticsPracticePeriodSnapshot,
  AnalyticsResponse,
  ReadPracticePeriodParams,
} from '@hms/shared-types';

import { AnalyticsPracticeRepository } from '../repository/analytics-practice.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsPracticeData } from './build-analytics-practice-data';

/**
 * "Praktik saya" (P29-T15, PRD FR-PRC-01 to 03): a clinician's own
 * finished encounters, consultation length, appointments, sessions and
 * diagnoses. The clinician is always the one signed in, resolved from their
 * own profile; a `doctorId`, poli or payer in the query is ignored, so the
 * `:own` grant can never read a colleague.
 */
@Injectable()
export class AnalyticsPracticeService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsPracticeRepository: AnalyticsPracticeRepository,
  ) {}

  /**
   * Reads the signed-in clinician's practice for a period, from cache when
   * fresh. The cache key carries the clinician, so two clinicians asking for
   * the same period never share an answer. Refuses a user with no clinician
   * profile.
   */
  async getMyPractice(
    filter: AnalyticsFilterInput,
    userId: string,
  ): Promise<AnalyticsResponse<AnalyticsPracticeData>> {
    const doctorId = await this.analyticsPracticeRepository.findClinicianId(userId);
    if (doctorId === null) {
      throw new ForbiddenException({
        code: 'ANALYTICS_NO_CLINICIAN_PROFILE',
        message: 'Only a doctor or midwife with a clinician profile has a practice to show',
      });
    }
    const ownFilter: AnalyticsFilterInput = {
      from: filter.from,
      to: filter.to,
      compare: filter.compare,
      doctorId,
    };
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'my-practice', filter: { ...ownFilter } },
      load: () => this.loadPractice(ownFilter, doctorId),
    });
  }

  private async loadPractice(
    filter: AnalyticsFilterInput,
    doctorId: string,
  ): Promise<AnalyticsResponse<AnalyticsPracticeData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod({ range, doctorId });
    const comparison = comparisonRange
      ? await this.readPeriod({ range: comparisonRange, doctorId })
      : undefined;
    return {
      data: buildAnalyticsPracticeData({ current, comparison }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod({
    range,
    doctorId,
  }: ReadPracticePeriodParams): Promise<AnalyticsPracticePeriodSnapshot> {
    const snapshot = await this.analyticsPracticeRepository.readSnapshot(
      this.analyticsRangeService.buildSqlScope(range, {
        from: range.from,
        to: range.to,
        compare: false,
        doctorId,
      }),
    );
    return { range, snapshot };
  }
}
