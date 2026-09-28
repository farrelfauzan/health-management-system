import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsOperationsData,
  AnalyticsOperationsPeriodSnapshot,
  AnalyticsResponse,
  ReadOperationsPeriodParams,
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
    this.assertPayerFilterUnused(filter);
    // The inpatient block exists only with the rooms and inpatient feature
    // (PRD FR-OPS-09); it is part of the cache key so a toggle shows at once.
    const includeInpatient = await this.featureAvailabilityCache.isEnabled('room-management');
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'operations', filter: { ...filter, includeInpatient } },
      load: () => this.loadOperations(filter, includeInpatient),
    });
  }

  /**
   * Visits do not record who pays yet; P29-T07 adds the field. Until then a
   * payer filter is refused rather than silently ignored, because a number
   * labelled "BPJS only" that counts everyone is worse than no number.
   */
  private assertPayerFilterUnused(filter: AnalyticsFilterInput): void {
    if (filter.payerType !== undefined) {
      throw new BadRequestException({
        code: 'ANALYTICS_PAYER_FILTER_UNAVAILABLE',
        message: 'Filtering by payer is not available yet.',
      });
    }
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
