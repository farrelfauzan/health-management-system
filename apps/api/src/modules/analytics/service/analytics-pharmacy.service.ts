import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsPharmacyData,
  AnalyticsPharmacyPeriodSnapshot,
  AnalyticsResponse,
  ReadPharmacyPeriodParams,
} from '@hms/shared-types';

import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { AnalyticsPharmacyRepository } from '../repository/analytics-pharmacy.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsPharmacyData } from './build-analytics-pharmacy-data';

const PHARMACY_FEATURE = 'pharmacy';

/**
 * The pharmacy dashboard (P29-T13, PRD FR-PHR-01 to 05): what was
 * prescribed and dispensed in the range, what it earned, and the stock that
 * needs attention now.
 */
@Injectable()
export class AnalyticsPharmacyService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsPharmacyRepository: AnalyticsPharmacyRepository,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  /**
   * Reads the pharmacy dashboard for a filter, from cache when fresh. The
   * controller is gated on `analytics`; a clinic without the pharmacy module
   * has nothing to show here, so this refuses with the same
   * `FEATURE_DISABLED` the guard would.
   */
  async getPharmacy(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsPharmacyData>> {
    if (!(await this.featureAvailabilityCache.isEnabled(PHARMACY_FEATURE))) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: `The ${PHARMACY_FEATURE} feature is not enabled for this client`,
      });
    }
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'pharmacy', filter: { ...filter } },
      load: () => this.loadPharmacy(filter),
    });
  }

  private async loadPharmacy(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsPharmacyData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod({ range, filter });
    const comparison = comparisonRange
      ? await this.readPeriod({ range: comparisonRange, filter })
      : undefined;
    const stock = await this.analyticsPharmacyRepository.readStock(range.timeZone);
    return {
      data: buildAnalyticsPharmacyData({ current, comparison, stock }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod({
    range,
    filter,
  }: ReadPharmacyPeriodParams): Promise<AnalyticsPharmacyPeriodSnapshot> {
    const snapshot = await this.analyticsPharmacyRepository.readSnapshot(
      this.analyticsRangeService.buildSqlScope(range, filter),
    );
    return { range, snapshot };
  }
}
