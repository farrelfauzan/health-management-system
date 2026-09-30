import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsLaboratoryData,
  AnalyticsLaboratoryPeriodSnapshot,
  AnalyticsResponse,
  ReadLaboratoryPeriodParams,
} from '@hms/shared-types';

import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { AnalyticsLaboratoryRepository } from '../repository/analytics-laboratory.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsLaboratoryData } from './build-analytics-laboratory-data';

const LABORATORY_FEATURE = 'laboratory';

/**
 * The laboratory dashboard (P29-T14, PRD FR-LAB-01 to 04): orders by status
 * and source, turnaround overall and per test, the tests ordered most, and
 * how often a sample is taken again or an order cancelled.
 */
@Injectable()
export class AnalyticsLaboratoryService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsLaboratoryRepository: AnalyticsLaboratoryRepository,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  /**
   * Reads the laboratory dashboard for a filter, from cache when fresh. The
   * controller is gated on `analytics`; a clinic without the laboratory
   * module has nothing to show here, so this refuses with the same
   * `FEATURE_DISABLED` the guard would.
   */
  async getLaboratory(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsLaboratoryData>> {
    if (!(await this.featureAvailabilityCache.isEnabled(LABORATORY_FEATURE))) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: `The ${LABORATORY_FEATURE} feature is not enabled for this client`,
      });
    }
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'laboratory', filter: { ...filter } },
      load: () => this.loadLaboratory(filter),
    });
  }

  private async loadLaboratory(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsLaboratoryData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod({ range, filter });
    const comparison = comparisonRange
      ? await this.readPeriod({ range: comparisonRange, filter })
      : undefined;
    return {
      data: buildAnalyticsLaboratoryData({ current, comparison }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod({
    range,
    filter,
  }: ReadLaboratoryPeriodParams): Promise<AnalyticsLaboratoryPeriodSnapshot> {
    const snapshot = await this.analyticsLaboratoryRepository.readSnapshot(
      this.analyticsRangeService.buildSqlScope(range, filter),
    );
    return { range, snapshot };
  }
}
