import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { getStartOfCalendarDateInTimeZone } from '@hms/shared-types';
import { Pool, type PoolClient } from 'pg';

import { ANALYTICS_BENCHMARK_QUERIES } from './analytics-benchmark-queries';
import type {
  AnalyticsBenchmarkDashboard,
  AnalyticsBenchmarkOptions,
  AnalyticsBenchmarkParams,
  AnalyticsBenchmarkQuery,
  AnalyticsBenchmarkRange,
  AnalyticsBenchmarkTiming,
  AnalyticsBenchmarkVariant,
} from './analytics-benchmark.types';
import { assertAnalyticsBenchmarkTarget } from './assert-analytics-benchmark-target';
import { computePercentile } from './compute-percentile';

const TIME_ZONE = 'Asia/Jakarta';
const STATEMENT_TIMEOUT_MS = 10_000;
const WARM_UP_RUNS = 2;
const DEFAULT_RUNS = 20;
const DEFAULT_OUTPUT_PATH = 'analytics-benchmark-report.md';
const FIXTURE_PATH = join('prisma', 'fixtures', 'analytics-volume-fixture.sql');
const FIXTURE_DOCTOR_ID = 'd0000000-0000-4000-8000-000000000001';
const MILLISECONDS_PER_DAY = 86_400_000;

// The acceptance gates of P29-T03 (NFR-AN-01), per dashboard request.
const GATE_MS_BY_RANGE: Readonly<Record<string, number>> = { '30 days': 400, '12 months': 1500 };

const RANGES: readonly AnalyticsBenchmarkRange[] = [
  { label: '30 days', from: '2026-09-01', to: '2026-09-30', granularity: 'day' },
  { label: '12 months', from: '2025-10-01', to: '2026-09-30', granularity: 'month' },
];

// What the dashboard compares each range with (P29-T02's comparison rule).
const COMPARISON_RANGES: Readonly<Record<string, AnalyticsBenchmarkRange>> = {
  '30 days': { label: 'August', from: '2026-08-01', to: '2026-08-31', granularity: 'day' },
  '12 months': {
    label: 'previous year',
    from: '2024-10-01',
    to: '2025-09-30',
    granularity: 'month',
  },
};

function addOneDay(date: string): string {
  const next = new Date(new Date(`${date}T00:00:00.000Z`).getTime() + MILLISECONDS_PER_DAY);
  return next.toISOString().slice(0, 10);
}

function toUtcTimestamp(localDate: string): string {
  return getStartOfCalendarDateInTimeZone(localDate, TIME_ZONE)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

function buildParams(
  range: AnalyticsBenchmarkRange,
  variant: AnalyticsBenchmarkVariant,
): AnalyticsBenchmarkParams {
  return {
    startUtc: toUtcTimestamp(range.from),
    endUtc: toUtcTimestamp(addOneDay(range.to)),
    granularity: range.granularity,
    timeZone: TIME_ZONE,
    doctorId: variant.doctorId,
    specialtyId: variant.specialtyId,
  };
}

function bindParams(
  query: AnalyticsBenchmarkQuery,
  params: AnalyticsBenchmarkParams,
): (string | null)[] {
  return query.params.map((name) => params[name]);
}

/** Runs one query the way `AnalyticsQueryRepository.runReadOnly` does, and times it. */
async function timeQuery(
  client: PoolClient,
  sql: string,
  values: (string | null)[],
): Promise<number> {
  await client.query('BEGIN READ ONLY');
  await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  const startedAt = performance.now();
  await client.query(sql, values);
  const elapsedMs = performance.now() - startedAt;
  await client.query('COMMIT');
  return elapsedMs;
}

async function explainQuery(
  client: PoolClient,
  sql: string,
  values: (string | null)[],
): Promise<string> {
  const result = await client.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`,
    values,
  );
  return result.rows.map((row) => row['QUERY PLAN']).join('\n');
}

async function sampleRuns(runs: number, run: () => Promise<number>): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < WARM_UP_RUNS + runs; index += 1) {
    const elapsedMs = await run();
    if (index >= WARM_UP_RUNS) {
      samples.push(elapsedMs);
    }
  }
  return samples;
}

async function benchmarkQuery(
  client: PoolClient,
  query: AnalyticsBenchmarkQuery,
  params: AnalyticsBenchmarkParams,
  runs: number,
): Promise<Pick<AnalyticsBenchmarkTiming, 'p50Ms' | 'p95Ms' | 'plan'>> {
  const values = bindParams(query, params);
  const samples = await sampleRuns(runs, () => timeQuery(client, query.sql, values));
  return {
    p50Ms: computePercentile(samples, 50),
    p95Ms: computePercentile(samples, 95),
    plan: await explainQuery(client, query.sql, values),
  };
}

/** One dashboard request: every query of the dashboard, for the range and its comparison. */
async function timeDashboardRequest(
  client: PoolClient,
  queries: readonly AnalyticsBenchmarkQuery[],
  paramSets: readonly AnalyticsBenchmarkParams[],
): Promise<number> {
  let totalMs = 0;
  for (const params of paramSets) {
    for (const query of queries) {
      totalMs += await timeQuery(client, query.sql, bindParams(query, params));
    }
  }
  return totalMs;
}

async function loadFixture(client: PoolClient): Promise<void> {
  const fixtureSql = readFileSync(FIXTURE_PATH, 'utf8');
  await client.query('BEGIN');
  await client.query(fixtureSql);
  await client.query('COMMIT');
}

async function findGeneralPracticeId(client: PoolClient): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM specialties WHERE name = 'General Practice' LIMIT 1`,
  );
  return result.rows[0]?.id ?? null;
}

function parseOptions(argv: readonly string[], env: NodeJS.ProcessEnv): AnalyticsBenchmarkOptions {
  const databaseUrl = env.ANALYTICS_BENCHMARK_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'Set ANALYTICS_BENCHMARK_DATABASE_URL to a throwaway database; DATABASE_URL is deliberately ignored',
    );
  }
  const readFlag = (name: string): string | undefined =>
    argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
  return {
    databaseUrl,
    shouldSeed: argv.includes('--seed'),
    runs: Number(readFlag('runs') ?? DEFAULT_RUNS),
    outputPath: readFlag('out') ?? DEFAULT_OUTPUT_PATH,
  };
}

function formatMs(value: number): string {
  return value.toFixed(1);
}

function buildQueryTable(timings: readonly AnalyticsBenchmarkTiming[]): string {
  const header = '| Query | Range | Filter | p50 ms | p95 ms |\n|---|---|---|---:|---:|';
  const rows = timings.map(
    (timing) =>
      `| ${timing.queryId} | ${timing.rangeLabel} | ${timing.variantLabel} | ${formatMs(timing.p50Ms)} | ${formatMs(timing.p95Ms)} |`,
  );
  return [header, ...rows].join('\n');
}

function buildPlanSections(timings: readonly AnalyticsBenchmarkTiming[]): string {
  return timings
    .map(
      (timing) =>
        `<details><summary>${timing.queryId} · ${timing.rangeLabel} · ${timing.variantLabel}</summary>\n\n\`\`\`\n${timing.plan}\n\`\`\`\n</details>`,
    )
    .join('\n\n');
}

async function runBenchmark(options: AnalyticsBenchmarkOptions): Promise<void> {
  const databaseName = new URL(options.databaseUrl).pathname.slice(1);
  assertAnalyticsBenchmarkTarget({ nodeEnv: process.env.NODE_ENV, databaseName });
  const pool = new Pool({ connectionString: options.databaseUrl });
  const client = await pool.connect();
  try {
    if (options.shouldSeed) {
      await loadFixture(client);
    }
    const variants: AnalyticsBenchmarkVariant[] = [
      { label: 'none', doctorId: null, specialtyId: null },
      { label: 'one doctor', doctorId: FIXTURE_DOCTOR_ID, specialtyId: null },
      { label: 'one poli', doctorId: null, specialtyId: await findGeneralPracticeId(client) },
    ];
    const timings: AnalyticsBenchmarkTiming[] = [];
    for (const range of RANGES) {
      for (const variant of variants) {
        for (const query of ANALYTICS_BENCHMARK_QUERIES) {
          const result = await benchmarkQuery(
            client,
            query,
            buildParams(range, variant),
            options.runs,
          );
          timings.push({
            queryId: query.id,
            rangeLabel: range.label,
            variantLabel: variant.label,
            ...result,
          });
          process.stdout.write(
            `${query.id} ${range.label} ${variant.label}: p95 ${formatMs(result.p95Ms)} ms\n`,
          );
        }
      }
    }
    const dashboardLines: string[] = [];
    const dashboards: AnalyticsBenchmarkDashboard[] = [
      'operations',
      'reporting',
      'finance',
      'case-mix',
    ];
    for (const dashboard of dashboards) {
      const queries = ANALYTICS_BENCHMARK_QUERIES.filter((query) => query.dashboard === dashboard);
      for (const range of RANGES) {
        for (const variant of variants) {
          const comparison = COMPARISON_RANGES[range.label] ?? range;
          const paramSets = [buildParams(range, variant), buildParams(comparison, variant)];
          const samples = await sampleRuns(options.runs, () =>
            timeDashboardRequest(client, queries, paramSets),
          );
          const p95Ms = computePercentile(samples, 95);
          const gateMs = GATE_MS_BY_RANGE[range.label] ?? 0;
          const verdict = p95Ms < gateMs ? 'meets' : '**misses**';
          dashboardLines.push(
            `| ${dashboard} | ${range.label} | ${variant.label} | ${formatMs(computePercentile(samples, 50))} | ${formatMs(p95Ms)} | < ${gateMs} | ${verdict} |`,
          );
        }
      }
    }
    const report = [
      '# P29-T03 analytics benchmark',
      '',
      `Database \`${databaseName}\`, ${options.runs} timed runs after ${WARM_UP_RUNS} warm-up runs, each in a read-only transaction with a ${STATEMENT_TIMEOUT_MS / 1000} s statement timeout. Warm cache.`,
      '',
      '## Dashboard requests (range + comparison period, compare on)',
      '',
      '| Dashboard | Range | Filter | p50 ms | p95 ms | Gate ms | Verdict |\n|---|---|---|---:|---:|---:|---|',
      ...dashboardLines,
      '',
      '## Per query',
      '',
      buildQueryTable(timings),
      '',
      '## Plans (`EXPLAIN (ANALYZE, BUFFERS)`)',
      '',
      buildPlanSections(timings),
      '',
    ].join('\n');
    writeFileSync(options.outputPath, report);
    process.stdout.write(`Report written to ${options.outputPath}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * P29-T03: times every Sprint 1 analytics query on twelve months of invented
 * clinic data. `--seed` first loads `prisma/fixtures/analytics-volume-fixture.sql`
 * into an empty, migrated and seeded database.
 *
 * Usage:
 *   ANALYTICS_BENCHMARK_DATABASE_URL=postgresql://…/hms_analytics_perf \
 *     pnpm --filter @hms/api analytics:benchmark [--seed] [--runs=20] [--out=report.md]
 *
 * Reads only `ANALYTICS_BENCHMARK_DATABASE_URL`, never `DATABASE_URL`, and
 * refuses a database whose name lacks `analytics_perf`, so it cannot land in
 * the shared dev database by way of a stale `.env`.
 */
runBenchmark(parseOptions(process.argv.slice(2), process.env)).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
