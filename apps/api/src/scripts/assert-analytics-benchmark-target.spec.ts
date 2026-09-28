import { assertAnalyticsBenchmarkTarget } from './assert-analytics-benchmark-target';

describe('assertAnalyticsBenchmarkTarget', () => {
  it('allows a throwaway database named for the benchmark', () => {
    expect(() =>
      assertAnalyticsBenchmarkTarget({
        nodeEnv: 'development',
        databaseName: 'hms_analytics_perf',
      }),
    ).not.toThrow();
  });

  it.each(['hms_dev', 'postgres', 'hms_analytics'])('refuses the database %s', (inputName) => {
    expect(() =>
      assertAnalyticsBenchmarkTarget({ nodeEnv: 'development', databaseName: inputName }),
    ).toThrow('the database name must contain "analytics_perf"');
  });

  it('refuses production whatever the database is called', () => {
    expect(() =>
      assertAnalyticsBenchmarkTarget({ nodeEnv: 'production', databaseName: 'hms_analytics_perf' }),
    ).toThrow('NODE_ENV is production');
  });
});
