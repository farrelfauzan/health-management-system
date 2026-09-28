/** How a dashboard's time series is bucketed (PRD FR-FDN-04). */
export type AnalyticsGranularity = 'day' | 'week' | 'month';

/**
 * A clinical or demographic count too small to show (1–4 by default, PRD
 * FR-FDN-05). The number is withheld, not rounded: a "<5" that could be
 * recovered by subtraction would be no protection at all.
 */
export type AnalyticsSuppressedCount = {
  suppressed: true;
};

export type AnalyticsCount = number | AnalyticsSuppressedCount;

/** The filter's comparison period and its totals. */
export type AnalyticsComparison<TTotals> = {
  from: string;
  to: string;
  totals: TTotals;
};

/**
 * What every dashboard answers (PRD FR-FDN-06): headline totals, the time
 * series, the breakdowns, and the comparison period's totals when asked.
 * Each dashboard names its own shapes.
 */
export type AnalyticsDashboardData<TTotals, TSeries, TBreakdowns> = {
  totals: TTotals;
  series: TSeries;
  breakdowns: TBreakdowns;
  comparison?: AnalyticsComparison<TTotals>;
};

/**
 * `generatedAt` is the instant the figures were read, shown as "Data per …"
 * (NFR-AN-04). A cached answer keeps the instant it was first read.
 */
export type AnalyticsResponseMeta = {
  from: string;
  to: string;
  timezone: string;
  granularity: AnalyticsGranularity;
  generatedAt: string;
};

export type AnalyticsResponse<TData> = {
  data: TData;
  meta: AnalyticsResponseMeta;
};

/**
 * The operations dashboard. Empty until P29-T04 fills its totals, series
 * and breakdowns; the envelope and meta are already the final shape.
 */
export type AnalyticsOperationsData = AnalyticsDashboardData<
  Record<string, never>,
  readonly never[],
  Record<string, never>
>;
