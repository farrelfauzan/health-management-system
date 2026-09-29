import { Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsReportingHealthData,
  AnalyticsReportingHealthSnapshot,
  AnalyticsResponse,
} from '@hms/shared-types';

import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { AnalyticsReportingHealthRepository } from '../repository/analytics-reporting-health.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';

/**
 * The reporting status page (P29-T06): whether the clinic's data reached
 * SATUSEHAT and BPJS, and what stops the rest. Reads the period only; poli
 * and clinician do not narrow a submission queue.
 */
@Injectable()
export class AnalyticsReportingHealthService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsReportingHealthRepository: AnalyticsReportingHealthRepository,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  /** Reads the reporting status for a period, from cache when fresh. */
  async getReportingHealth(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsReportingHealthData>> {
    const includeBpjs = await this.isBpjsEnabled();
    const period = { from: filter.from, to: filter.to, compare: false };
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'reporting-health', filter: { ...period, includeBpjs } },
      load: () => this.loadReportingHealth(period, includeBpjs),
    });
  }

  /** The BPJS block shows when either BPJS integration is switched on. */
  private async isBpjsEnabled(): Promise<boolean> {
    const [isPcareEnabled, isAntreanEnabled] = await Promise.all([
      this.featureAvailabilityCache.isEnabled('bpjs-pcare'),
      this.featureAvailabilityCache.isEnabled('bpjs-antrean'),
    ]);
    return isPcareEnabled || isAntreanEnabled;
  }

  private async loadReportingHealth(
    filter: AnalyticsFilterInput,
    includeBpjs: boolean,
  ): Promise<AnalyticsResponse<AnalyticsReportingHealthData>> {
    const generatedAt = new Date();
    const { range } = this.analyticsRangeService.resolveRanges(filter);
    const snapshot = await this.analyticsReportingHealthRepository.readSnapshot({
      scope: this.analyticsRangeService.buildSqlScope(range, filter),
      includeBpjs,
    });
    return {
      data: this.toReportingHealthData(snapshot),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private toReportingHealthData(
    snapshot: AnalyticsReportingHealthSnapshot,
  ): AnalyticsReportingHealthData {
    return {
      satusehat: snapshot.satusehat.map((row) => ({
        ...row,
        oldestPendingAt: row.oldestPendingAt ? row.oldestPendingAt.toISOString() : null,
      })),
      bpjs: snapshot.bpjs,
      readiness: snapshot.readiness,
    };
  }
}
