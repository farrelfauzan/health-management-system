import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Turns the cahyadsn/wilayah dump (`db/wilayah.sql`, one `wilayah(kode, nama)`
 * table, MIT) into `prisma/wilayah.sql`: four idempotent multi-row upserts,
 * one table per level, that `prisma db execute` can load (P19-T10).
 *
 * Usage:
 *   pnpm --filter @hms/api wilayah:build -- <path/to/wilayah.sql> --commit <sha>
 *
 * The dump is not committed; only its transformation is. Re-running against a
 * newer dump regenerates the seed, and the commit written into the header is
 * what says which Kemendagri decree the rows follow.
 */

const DEFAULT_OUTPUT_PATH = 'prisma/wilayah.sql';
const SOURCE_REPOSITORY_URL = 'https://github.com/cahyadsn/wilayah';
const SOURCE_FILE_PATH = 'db/wilayah.sql';
const SOURCE_LICENCE = 'MIT';
const ROWS_PER_STATEMENT = 5000;
const CODE_TUPLE_PATTERN = /\('(\d{2}(?:\.\d{2}){0,2}(?:\.\d{4})?)','((?:[^']|'')*)'\)/g;

type RegionLevel = {
  readonly table: string;
  readonly parentColumn: string | null;
  readonly segments: number;
};

type RegionRow = {
  readonly code: string;
  readonly name: string;
  readonly parentCode: string | null;
};

type SeedBuildOptions = {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly sourceCommit: string;
};

const REGION_LEVELS: readonly RegionLevel[] = [
  { table: 'provinces', parentColumn: null, segments: 1 },
  { table: 'regencies', parentColumn: 'province_code', segments: 2 },
  { table: 'districts', parentColumn: 'regency_code', segments: 3 },
  { table: 'villages', parentColumn: 'district_code', segments: 4 },
];

function parseOptions(argv: readonly string[]): SeedBuildOptions {
  const positional: string[] = [];
  let sourceCommit = '';
  let outputPath = DEFAULT_OUTPUT_PATH;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--commit') {
      sourceCommit = argv[index + 1] ?? '';
      index += 1;
    } else if (argument === '--out') {
      outputPath = argv[index + 1] ?? DEFAULT_OUTPUT_PATH;
      index += 1;
    } else if (argument !== undefined) {
      positional.push(argument);
    }
  }
  const sourcePath = positional[0];
  if (!sourcePath) {
    throw new Error('Usage: build-wilayah-seed <source wilayah.sql> --commit <sha> [--out <path>]');
  }
  if (!/^[0-9a-f]{7,40}$/.test(sourceCommit)) {
    throw new Error('--commit must be the git SHA of the cahyadsn/wilayah dump used');
  }
  return { sourcePath: resolve(sourcePath), outputPath: resolve(outputPath), sourceCommit };
}

function unescapeSqlString(value: string): string {
  return value.replace(/''/g, "'");
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function resolveParentCode(code: string): string | null {
  const lastDot = code.lastIndexOf('.');
  return lastDot === -1 ? null : code.slice(0, lastDot);
}

function parseRows(dump: string): RegionRow[] {
  const rows: RegionRow[] = [];
  for (const match of dump.matchAll(CODE_TUPLE_PATTERN)) {
    const code = match[1] ?? '';
    const name = unescapeSqlString(match[2] ?? '').trim();
    rows.push({ code, name, parentCode: resolveParentCode(code) });
  }
  return rows;
}

function groupByLevel(rows: readonly RegionRow[]): Map<number, RegionRow[]> {
  const grouped = new Map<number, RegionRow[]>();
  for (const row of rows) {
    const segments = row.code.split('.').length;
    const bucket = grouped.get(segments) ?? [];
    bucket.push(row);
    grouped.set(segments, bucket);
  }
  return grouped;
}

/**
 * Every child must name a parent the same dump contains: the seed inserts
 * level by level under foreign keys, so an orphan would abort the whole load
 * halfway through rather than fail here with the code in the message.
 */
function assertChainIntegrity(rows: readonly RegionRow[]): void {
  const codes = new Set(rows.map((row) => row.code));
  const duplicates = rows.length - codes.size;
  if (duplicates > 0) {
    throw new Error(`Dump contains ${duplicates} duplicated codes`);
  }
  const orphans = rows.filter((row) => row.parentCode !== null && !codes.has(row.parentCode));
  if (orphans.length > 0) {
    throw new Error(
      `Dump contains ${orphans.length} rows whose parent is missing, first: ${orphans[0]?.code}`,
    );
  }
  const unnamed = rows.filter((row) => row.name.length === 0);
  if (unnamed.length > 0) {
    throw new Error(`Dump contains ${unnamed.length} unnamed rows, first: ${unnamed[0]?.code}`);
  }
}

function renderValueTuple(row: RegionRow, hasParent: boolean): string {
  const parent = hasParent ? `, '${row.parentCode}'` : '';
  return `('${row.code}', '${escapeSqlString(row.name)}'${parent})`;
}

function renderUpsert(level: RegionLevel, rows: readonly RegionRow[]): string {
  const hasParent = level.parentColumn !== null;
  const columns = ['"code"', '"name"', ...(hasParent ? [`"${level.parentColumn}"`] : [])];
  const parentUpdate = hasParent
    ? `, "${level.parentColumn}" = EXCLUDED."${level.parentColumn}"`
    : '';
  const parentChanged = hasParent
    ? ` OR "${level.table}"."${level.parentColumn}" IS DISTINCT FROM EXCLUDED."${level.parentColumn}"`
    : '';
  const values = rows.map((row) => renderValueTuple(row, hasParent)).join(',\n');
  return [
    `INSERT INTO "${level.table}" (${columns.join(', ')}, "updated_at") `,
    `SELECT ${columns.join(', ')}, now() FROM (VALUES\n${values}\n) AS seed(${columns.join(', ')})`,
    `ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name"${parentUpdate}, "updated_at" = now()`,
    `WHERE "${level.table}"."name" IS DISTINCT FROM EXCLUDED."name"${parentChanged};`,
  ].join('\n');
}

function renderLevel(level: RegionLevel, rows: readonly RegionRow[]): string {
  const statements: string[] = [`-- ${level.table}: ${rows.length} rows`];
  for (let offset = 0; offset < rows.length; offset += ROWS_PER_STATEMENT) {
    statements.push(renderUpsert(level, rows.slice(offset, offset + ROWS_PER_STATEMENT)));
  }
  return statements.join('\n');
}

function renderHeader(options: SeedBuildOptions, grouped: Map<number, RegionRow[]>): string {
  const counts = REGION_LEVELS.map(
    (level) => `--   ${level.table.padEnd(10)} ${grouped.get(level.segments)?.length ?? 0}`,
  );
  return [
    '-- P19-T10 (SJ-167): Indonesian region master data — province, regency,',
    '-- district and village — keyed by the Kemendagri kode wilayah.',
    '--',
    '-- GENERATED FILE. Do not edit by hand; regenerate with',
    '--   pnpm --filter @hms/api wilayah:build -- <db/wilayah.sql> --commit <sha>',
    '-- (apps/api/src/scripts/build-wilayah-seed.ts). See',
    '-- docs/ops/region-master-data.md for the procedure and the dataset notes.',
    '--',
    `-- Source:  ${SOURCE_REPOSITORY_URL} (${SOURCE_FILE_PATH})`,
    `-- Commit:  ${options.sourceCommit}`,
    `-- Licence: ${SOURCE_LICENCE} — copyright (c) Cahya DSN. The codes and names`,
    '--          themselves are Kemendagri administrative data (Kepmendagri No.',
    '--          300.2.2-2138 Tahun 2025 and its updates, as tracked upstream).',
    '-- Rows:',
    ...counts,
    '--',
    '-- Run by `pnpm db:seed` after `lab-catalog.sql`, and idempotent: every',
    '-- statement upserts on the code and only touches a row whose name or',
    '-- parent changed, so re-running is a no-op. Rows the dataset no longer',
    '-- carries are left in place — a region with patients in it is deactivated',
    '-- by hand, never removed by a seed. Inserted level by level so every',
    '-- parent exists before its children under the foreign keys.',
    '',
  ].join('\n');
}

function buildSeed(options: SeedBuildOptions): string {
  const rows = parseRows(readFileSync(options.sourcePath, 'utf8'));
  if (rows.length === 0) {
    throw new Error(`No (kode, nama) tuples found in ${options.sourcePath}`);
  }
  assertChainIntegrity(rows);
  const grouped = groupByLevel(rows);
  const unexpectedLevels = [...grouped.keys()].filter(
    (segments) => !REGION_LEVELS.some((level) => level.segments === segments),
  );
  if (unexpectedLevels.length > 0) {
    throw new Error(`Dump contains codes with ${unexpectedLevels.join(', ')} segments`);
  }
  const body = REGION_LEVELS.map((level) =>
    renderLevel(level, grouped.get(level.segments) ?? []),
  );
  return [renderHeader(options, grouped), 'BEGIN;', '', ...body, '', 'COMMIT;', ''].join('\n');
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const seed = buildSeed(options);
  writeFileSync(options.outputPath, seed, 'utf8');
  process.stdout.write(`Wrote ${options.outputPath} (${seed.length} bytes)\n`);
}

main();
