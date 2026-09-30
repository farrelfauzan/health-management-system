import { Injectable } from '@nestjs/common';
import {
  computeChangePercent,
  type AnalyticsFilterInput,
  type AnalyticsOperationsData,
  type AnalyticsOperationsPeriodSnapshot,
  type AnalyticsResponse,
  type AnalyticsVisitsTodayResponse,
  type ReadOperationsPeriodParams,
} from '@hms/shared-types';

import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { AnalyticsOperationsRepository } from '../repository/analytics-operations.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsOperationsData } from './build-analytics-operations-data';

/**
 * The operations dashboard (P29-T04, PRD FR-OPS-01 to 05): visits by type,
 * new against returning patients, poli and doctor, appointment outcomes and
 * booking channel, for the filter's range and, with `compare`, its
 * comparison period.
 */
@Injectable()
export class AnalyticsOperationsService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsOperationsRepository: AnalyticsOperationsRepository,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  /** Reads the operations dashboard for a filter, from cache when fresh. */
  async getOperations(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsOperationsData>> {
    // The inpatient block exists only with the rooms and inpatient feature
    // (PRD FR-OPS-09); it is part of the cache key so a toggle shows at once.
    const includeInpatient = await this.featureAvailabilityCache.isEnabled('room-management');
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'operations', filter: { ...filter, includeInpatient } },
      load: () => this.loadOperations(filter, includeInpatient),
    });
  }

  /**
   * Visits so far today against the same weekday last week up to the same
   * clock time, for the home dashboard (P29-T16). Not cached: it is a
   * running count, and one indexed query.
   */
  async getVisitsToday(now: Date = new Date()): Promise<AnalyticsVisitsTodayResponse> {
    const windows = this.analyticsRangeService.resolveTodayWindows(now);
    const { visits, comparisonVisits } =
      await this.analyticsOperationsRepository.countVisitsToday(windows);
    return {
      data: {
        date: windows.date,
        comparisonDate: windows.comparisonDate,
        asOf: now.toISOString(),
        visits,
        comparisonVisits,
        changePercent: computeChangePercent(visits, comparisonVisits),
      },
    };
  }

  private async loadOperations(
    filter: AnalyticsFilterInput,
    includeInpatient: boolean,
  ): Promise<AnalyticsResponse<AnalyticsOperationsData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod({ range, filter, includeInpatient });
    const comparison = comparisonRange
      ? await this.readPeriod({ range: comparisonRange, filter, includeInpatient })
      : undefined;
    return {
      data: buildAnalyticsOperationsData({ current, comparison }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod({
    range,
    filter,
    includeInpatient,
  }: ReadOperationsPeriodParams): Promise<AnalyticsOperationsPeriodSnapshot> {
    const snapshot = await this.analyticsOperationsRepository.readSnapshot({
      scope: this.analyticsRangeService.buildSqlScope(range, filter),
      includeInpatient,
    });
    return { range, snapshot };
  }
}
