import type { AnalyticsGranularity } from '#analytics/contracts';

/** Local calendar dates, both ends included. */
export type AnalyticsPeriod = {
  from: string;
  to: string;
};

export type ResolveAnalyticsRangeParams = AnalyticsPeriod & {
  timeZone: string;
};

/**
 * A filter's dates cut into UTC instants in the clinic's time zone.
 * `start` is inclusive and `end` exclusive — the start of the day after `to`
 * — so a query is always `>= start AND < end`.
 */
export type AnalyticsRange = AnalyticsPeriod & {
  start: Date;
  end: Date;
  dayCount: number;
  granularity: AnalyticsGranularity;
  timeZone: string;
};

/** One row of a breakdown before suppression. */
export type AnalyticsCountCell = {
  count: number;
};

export type SuppressSmallCellsParams<TCell extends AnalyticsCountCell> = {
  cells: readonly TCell[];
  threshold?: number;
};

export type ResolvedAnalyticsRanges = {
  range: AnalyticsRange;
  comparisonRange?: AnalyticsRange;
};

/**
 * What an analytics answer is cached under: the dashboard, the filter, and
 * the viewer only for a dashboard scoped to them (`read-practice:own`).
 */
export type AnalyticsCacheKeyParts = {
  dashboard: string;
  filter: Record<string, unknown>;
  viewerId?: string;
};

/** One cached answer: the in-flight or settled load, and when it goes stale. */
export type AnalyticsCacheEntry = {
  expiresAtMs: number;
  value: Promise<unknown>;
};

export type GetOrLoadAnalyticsParams<TValue> = {
  key: AnalyticsCacheKeyParts;
  load: () => Promise<TValue>;
};

/** Options for one read-only analytics transaction. */
export type RunAnalyticsQueryOptions = {
  statementTimeoutMs?: number;
};
