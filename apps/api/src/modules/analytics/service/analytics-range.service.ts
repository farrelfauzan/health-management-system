import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_CLINIC_TIME_ZONE,
  resolveAnalyticsComparisonPeriod,
  resolveAnalyticsRange,
  type AnalyticsFilterInput,
  type AnalyticsRange,
  type AnalyticsResponseMeta,
  type ResolvedAnalyticsRanges,
} from '@hms/shared-types';

/**
 * Turns a dashboard filter into the UTC ranges its queries use, in the
 * clinic's time zone (`CLINIC_TIMEZONE`). The one place analytics reads the
 * zone, so no dashboard cuts a day differently from another.
 */
@Injectable()
export class AnalyticsRangeService {
  private readonly clinicTimeZone: string;

  constructor(configService: ConfigService) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /** The filter's range, and the comparison range when `compare` is on. */
  resolveRanges(filter: AnalyticsFilterInput): ResolvedAnalyticsRanges {
    const range = resolveAnalyticsRange({ ...filter, timeZone: this.clinicTimeZone });
    if (!filter.compare) {
      return { range };
    }
    const comparisonPeriod = resolveAnalyticsComparisonPeriod(filter);
    return {
      range,
      comparisonRange: resolveAnalyticsRange({ ...comparisonPeriod, timeZone: this.clinicTimeZone }),
    };
  }

  /** The response `meta` for a range read at `generatedAt`. */
  buildMeta(range: AnalyticsRange, generatedAt: Date): AnalyticsResponseMeta {
    return {
      from: range.from,
      to: range.to,
      timezone: range.timeZone,
      granularity: range.granularity,
      generatedAt: generatedAt.toISOString(),
    };
  }
}
