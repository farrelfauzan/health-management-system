import { Injectable } from '@nestjs/common';
import type {
  AnalyticsFilterInput,
  AnalyticsOperationsData,
  AnalyticsResponse,
} from '@hms/shared-types';

import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRangeService } from './analytics-range.service';

/**
 * The operations dashboard (PRD FR-OPS). Answers the final envelope with
 * empty figures; P29-T04 fills totals, series and breakdowns through
 * `AnalyticsQueryRepository`.
 */
@Injectable()
export class AnalyticsOperationsService {
  constructor(
    private readonly analyticsRangeService: AnalyticsRangeService,
    private readonly analyticsCacheService: AnalyticsCacheService,
  ) {}

  /** Reads the operations dashboard for a filter, from cache when fresh. */
  getOperations(filter: AnalyticsFilterInput): Promise<AnalyticsResponse<AnalyticsOperationsData>> {
    return this.analyticsCacheService.getOrLoad({
      key: { dashboard: 'operations', filter },
      load: async () => this.loadOperations(filter),
    });
  }

  private loadOperations(filter: AnalyticsFilterInput): AnalyticsResponse<AnalyticsOperationsData> {
    const { range, comparisonRange } = this.analyticsRangeService.resolveRanges(filter);
    const data: AnalyticsOperationsData = { totals: {}, series: [], breakdowns: {} };
    return {
      data: comparisonRange
        ? { ...data, comparison: { from: comparisonRange.from, to: comparisonRange.to, totals: {} } }
        : data,
      meta: this.analyticsRangeService.buildMeta(range, new Date()),
    };
  }
}
