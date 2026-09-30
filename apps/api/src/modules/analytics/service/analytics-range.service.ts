import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  addCalendarDays,
  DEFAULT_CLINIC_TIME_ZONE,
  getCalendarDateInTimeZone,
  resolveAnalyticsComparisonPeriod,
  resolveAnalyticsRange,
  type AnalyticsFilterInput,
  type AnalyticsRange,
  type AnalyticsResponseMeta,
  type AnalyticsSqlScope,
  type AnalyticsTodayWindows,
  type ResolvedAnalyticsRanges,
} from '@hms/shared-types';

const SQL_TIMESTAMP_LENGTH = 23;
const DAYS_PER_WEEK = 7;

function toSqlTimestamp(instant: Date): string {
  return instant.toISOString().replace('T', ' ').slice(0, SQL_TIMESTAMP_LENGTH);
}

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
      comparisonRange: resolveAnalyticsRange({
        ...comparisonPeriod,
        timeZone: this.clinicTimeZone,
      }),
    };
  }

  /**
   * What a repository query binds: the range as UTC `timestamp` text, so the
   * comparison with Postgres's `timestamp` columns never passes through a
   * session time zone, and the narrowing filters.
   */
  buildSqlScope(range: AnalyticsRange, filter: AnalyticsFilterInput): AnalyticsSqlScope {
    return {
      startUtc: toSqlTimestamp(range.start),
      endUtc: toSqlTimestamp(range.end),
      fromDate: range.from,
      toDate: range.to,
      granularity: range.granularity,
      timeZone: range.timeZone,
      doctorId: filter.doctorId,
      specialtyId: filter.specialtyId,
      payerType: filter.payerType,
    };
  }

  /**
   * Today in the clinic up to `now`, and the same stretch of the same
   * weekday a week earlier: from that day's local midnight for as long as
   * today has run so far (P29-T16).
   */
  resolveTodayWindows(now: Date): AnalyticsTodayWindows {
    const date = getCalendarDateInTimeZone(now, this.clinicTimeZone);
    const comparisonDate = addCalendarDays(date, -DAYS_PER_WEEK);
    const todayStart = resolveAnalyticsRange({
      from: date,
      to: date,
      timeZone: this.clinicTimeZone,
    }).start;
    const comparisonStart = resolveAnalyticsRange({
      from: comparisonDate,
      to: comparisonDate,
      timeZone: this.clinicTimeZone,
    }).start;
    const elapsedMs = now.getTime() - todayStart.getTime();
    return {
      date,
      comparisonDate,
      todayStartUtc: toSqlTimestamp(todayStart),
      nowUtc: toSqlTimestamp(now),
      comparisonStartUtc: toSqlTimestamp(comparisonStart),
      comparisonEndUtc: toSqlTimestamp(new Date(comparisonStart.getTime() + elapsedMs)),
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
