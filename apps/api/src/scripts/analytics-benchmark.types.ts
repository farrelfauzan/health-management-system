/** One clinic-local period the benchmark times every query over. */
export type AnalyticsBenchmarkRange = {
  label: string;
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
};

/** The positional parameters every candidate query takes, in order. */
export type AnalyticsBenchmarkParams = {
  startUtc: string;
  endUtc: string;
  granularity: string;
  timeZone: string;
  doctorId: string | null;
  specialtyId: string | null;
};

/** The dashboard a candidate query belongs to, and the ticket that ships it. */
export type AnalyticsBenchmarkDashboard =
  | 'operations'
  | 'reporting'
  | 'finance'
  | 'case-mix'
  | 'pharmacy'
  | 'laboratory';

/**
 * A candidate query. `params` names, in `$1…$n` order, which of the shared
 * parameters it binds — only those, because Postgres refuses a parameter it
 * cannot type, and binding the real values (not a one-row CTE) lets the
 * planner see the constants the way the API's queries will.
 */
export type AnalyticsBenchmarkQuery = {
  id: string;
  requirement: string;
  dashboard: AnalyticsBenchmarkDashboard;
  params: readonly (keyof AnalyticsBenchmarkParams)[];
  sql: string;
};

/** A filter combination the benchmark applies to every query. */
export type AnalyticsBenchmarkVariant = {
  label: string;
  doctorId: string | null;
  specialtyId: string | null;
};

export type AnalyticsBenchmarkTiming = {
  queryId: string;
  rangeLabel: string;
  variantLabel: string;
  p50Ms: number;
  p95Ms: number;
  plan: string;
};

export type AnalyticsBenchmarkTargetInput = {
  nodeEnv: string | undefined;
  databaseName: string;
};

export type AnalyticsBenchmarkOptions = {
  databaseUrl: string;
  shouldSeed: boolean;
  runs: number;
  outputPath: string;
};
