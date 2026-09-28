import type { AnalyticsBenchmarkTargetInput } from './analytics-benchmark.types';

const REQUIRED_DATABASE_NAME_PART = 'analytics_perf';

/**
 * Refuses to fill or time anything but a throwaway database (P29-T03). The
 * fixture writes 400 000 invented rows, so the database's own name has to
 * say it is disposable: a shared dev database or a clinic's would never be
 * called `…analytics_perf…` by accident.
 */
export function assertAnalyticsBenchmarkTarget({
  nodeEnv,
  databaseName,
}: AnalyticsBenchmarkTargetInput): void {
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run the analytics benchmark: NODE_ENV is production');
  }
  if (!databaseName.includes(REQUIRED_DATABASE_NAME_PART)) {
    throw new Error(
      `Refusing to run the analytics benchmark against "${databaseName}": the database name must contain "${REQUIRED_DATABASE_NAME_PART}"`,
    );
  }
}
