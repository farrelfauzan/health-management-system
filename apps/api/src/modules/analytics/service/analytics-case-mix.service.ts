import { Injectable } from '@nestjs/common';
import type {
  AnalyticsCaseMixData,
  AnalyticsCaseMixPeriodSnapshot,
  AnalyticsFilterInput,
  AnalyticsResponse,
  ReadCaseMixPeriodParams,
} from '@hms/shared-types';

import { AnalyticsCaseMixRepository } from '../repository/analytics-case-mix.repository';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';
import { buildAnalyticsCaseMixData } from './build-analytics-case-mix-data';

/**
 * The case-mix dashboard (P29-T12, PRD FR-CLN-01 to 04): what the clinic
 * treats, as suppressed counts of coded diagnoses and procedures, and how
 * completely its finished encounters are coded.
 */
@Injectable()
export class AnalyticsCaseMixService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
    private readonly analyticsCaseMixRepository: AnalyticsCaseMixRepository,
  ) {}

  /** Reads the case-mix dashboard for a filter, from cache when fresh. */
  getCaseMix(filter: AnalyticsFilterInput): Promise<AnalyticsResponse<AnalyticsCaseMixData>> {
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'case-mix', filter: { ...filter } },
      load: () => this.loadCaseMix(filter),
    });
  }

  private async loadCaseMix(
    filter: AnalyticsFilterInput,
  ): Promise<AnalyticsResponse<AnalyticsCaseMixData>> {
    const generatedAt = new Date();
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const current = await this.readPeriod({ range, filter });
    const comparison = comparisonRange
      ? await this.readPeriod({ range: comparisonRange, filter })
      : undefined;
    return {
      data: buildAnalyticsCaseMixData({ current, comparison }),
      meta: this.analyticsRangeService.buildMeta(range, generatedAt),
    };
  }

  private async readPeriod({
    range,
    filter,
  }: ReadCaseMixPeriodParams): Promise<AnalyticsCaseMixPeriodSnapshot> {
    const snapshot = await this.analyticsCaseMixRepository.readSnapshot(
      this.analyticsRangeService.buildSqlScope(range, filter),
    );
    return { range, snapshot };
  }
}
