import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deriveIcd10Chapter } from '@hms/shared-types';

import { parseCsvRows } from './parse-csv-rows';

/**
 * Turns an official SATUSEHAT terminology export (ICD-10 or ICD-9-CM, the
 * spreadsheets published on the platform's terminology pages, saved as CSV)
 * into `prisma/icd10.sql` or `prisma/icd9cm.sql`: idempotent multi-row upserts
 * that `prisma db execute` loads after `prisma db seed`.
 *
 * Usage:
 *   pnpm --filter @hms/api terminology:build -- icd10 <path/to/icd10.csv>
 *   pnpm --filter @hms/api terminology:build -- icd9cm <path/to/icd9cm.csv>
 *
 * The export is not committed; only its transformation is, the same rule the
 * region seed follows. Re-running against a newer export regenerates the file.
 *
 * Indonesian titles are deliberately never written here. The official exports
 * carry English titles only, and `seed.sql` curates a working Indonesian title
 * for the codes a clinic sees most; overwriting those with nothing would make
 * the catalog worse for the clinicians who search in Indonesian.
 */

const ROWS_PER_STATEMENT = 2000;
const TERMINOLOGY_PAGE_URL = 'https://satusehat.kemkes.go.id/platform/docs/id/terminology/';

type TerminologyCatalog = {
  readonly table: string;
  readonly idPrefix: string;
  readonly hasChapter: boolean;
  readonly defaultOutputPath: string;
  readonly label: string;
  readonly version: string;
  readonly sourceUrl: string;
};

type TerminologyRow = {
  readonly code: string;
  readonly display: string;
  readonly category: string;
  readonly chapter: string | null;
};

type SeedBuildOptions = {
  readonly catalogName: string;
  readonly sourcePath: string;
  readonly outputPath: string;
};

const TERMINOLOGY_CATALOGS: Record<string, TerminologyCatalog> = {
  icd10: {
    table: 'icd10_codes',
    idPrefix: 'icd10',
    hasChapter: true,
    defaultOutputPath: 'prisma/icd10.sql',
    label: 'ICD-10 diagnosis',
    version: 'ICD10_2010',
    sourceUrl: 'https://satusehat.kemkes.go.id/platform/docs/id/terminology/icd/icd-10/',
  },
  icd9cm: {
    table: 'icd9cm_codes',
    idPrefix: 'icd9cm',
    hasChapter: false,
    defaultOutputPath: 'prisma/icd9cm.sql',
    label: 'ICD-9-CM procedure',
    version: 'ICD9CM_2010',
    sourceUrl: 'https://satusehat.kemkes.go.id/platform/docs/id/terminology/icd/icd-9-cm/',
  },
};

function parseOptions(argv: readonly string[]): SeedBuildOptions {
  const positional: string[] = [];
  let outputPath = '';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out') {
      outputPath = argv[index + 1] ?? '';
      index += 1;
    } else if (argument !== undefined) {
      positional.push(argument);
    }
  }
  const catalogName = positional[0] ?? '';
  const sourcePath = positional[1];
  const catalog = TERMINOLOGY_CATALOGS[catalogName];
  if (!catalog || !sourcePath) {
    throw new Error(
      `Usage: build-terminology-seed <${Object.keys(TERMINOLOGY_CATALOGS).join('|')}> <export.csv> [--out <path>]`,
    );
  }
  return {
    catalogName,
    sourcePath: resolve(sourcePath),
    outputPath: resolve(outputPath === '' ? catalog.defaultOutputPath : outputPath),
  };
}

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z]/g, '');
}

function findColumnIndex(headers: readonly string[], candidates: readonly string[]): number {
  return headers.findIndex((header) => candidates.includes(header));
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Reads the export into validated rows. A duplicated code or a missing title
 * fails here, with the line number, rather than half-way through a load: the
 * generated file is one transaction, and the catalog is reference data every
 * diagnosis and procedure resolves against.
 */
function readTerminologyRows(
  filePath: string,
  catalog: TerminologyCatalog,
): readonly TerminologyRow[] {
  const rows = parseCsvRows(readFileSync(filePath, 'utf8')).filter((row) =>
    row.some((field) => field.trim().length > 0),
  );
  if (rows.length < 2) {
    throw new Error('The export needs a header line and at least one code row.');
  }
  const headers = (rows[0] ?? []).map(normaliseHeader);
  const codeIndex = findColumnIndex(headers, ['code', 'icdcode', 'kode']);
  const displayIndex = findColumnIndex(headers, ['display', 'title', 'displayen', 'name']);
  if (codeIndex === -1 || displayIndex === -1) {
    throw new Error(
      `Could not find a code column and a display column. Found: ${headers.join(', ')}`,
    );
  }
  const seenCodes = new Set<string>();
  return rows.slice(1).map((row, rowOffset) => {
    const code = (row[codeIndex] ?? '').trim().toUpperCase();
    const display = (row[displayIndex] ?? '').trim();
    if (code.length === 0 || display.length === 0) {
      throw new Error(`Line ${rowOffset + 2} is missing a code or a display title.`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Line ${rowOffset + 2} repeats code ${code}.`);
    }
    seenCodes.add(code);
    return {
      code,
      display,
      category: code.split('.')[0] ?? code,
      chapter: catalog.hasChapter ? deriveIcd10Chapter(code) : null,
    };
  });
}

function renderValueTuple(row: TerminologyRow, hasChapter: boolean): string {
  const chapter = hasChapter ? `, '${row.chapter ?? ''}'` : '';
  return `('${escapeSqlString(row.code)}', '${escapeSqlString(row.display)}', '${escapeSqlString(row.category)}'${chapter})`;
}

/**
 * One chunked upsert. `display_indonesian` is absent from both the insert list
 * and the update list on purpose: a new row gets none, and an existing row
 * keeps the title `seed.sql` curated for it. The `WHERE` clause keeps a re-run
 * from touching `updated_at` on rows that did not change.
 */
function renderUpsert(catalog: TerminologyCatalog, rows: readonly TerminologyRow[]): string {
  const chapterColumn = catalog.hasChapter ? ', "chapter"' : '';
  const chapterSelect = catalog.hasChapter ? ', nullif(seed.chapter, \'\')' : '';
  const chapterSeedColumn = catalog.hasChapter ? ', chapter' : '';
  const chapterAssignment = catalog.hasChapter ? '\n  "chapter" = EXCLUDED."chapter",' : '';
  const chapterChanged = catalog.hasChapter
    ? `\n   OR "${catalog.table}"."chapter" IS DISTINCT FROM EXCLUDED."chapter"`
    : '';
  const values = rows.map((row) => renderValueTuple(row, catalog.hasChapter)).join(',\n');
  return [
    `INSERT INTO "${catalog.table}" (`,
    `  "id", "code", "display", "category"${chapterColumn}, "is_active", "created_at", "updated_at", "deleted_at"`,
    ')',
    `SELECT md5('${catalog.idPrefix}:' || seed.code)::uuid, seed.code, seed.display, seed.category${chapterSelect}, true, now(), now(), NULL`,
    `FROM (VALUES\n${values}\n) AS seed(code, display, category${chapterSeedColumn})`,
    'ON CONFLICT ("code") DO UPDATE',
    'SET',
    '  "display" = EXCLUDED."display",',
    `  "category" = EXCLUDED."category",${chapterAssignment}`,
    '  "is_active" = true,',
    '  "updated_at" = now(),',
    '  "deleted_at" = NULL',
    `WHERE "${catalog.table}"."display" IS DISTINCT FROM EXCLUDED."display"`,
    `   OR "${catalog.table}"."category" IS DISTINCT FROM EXCLUDED."category"${chapterChanged}`,
    `   OR "${catalog.table}"."is_active" IS DISTINCT FROM true`,
    `   OR "${catalog.table}"."deleted_at" IS NOT NULL;`,
  ].join('\n');
}

function renderHeader(catalog: TerminologyCatalog, rows: readonly TerminologyRow[]): string {
  const uncharted = catalog.hasChapter ? rows.filter((row) => row.chapter === null).length : 0;
  const chapterNote = catalog.hasChapter
    ? [
        `--   ${uncharted} of them fall outside the 21 chapter ranges (U-codes) and`,
        '--   carry a NULL chapter, which is what deriveIcd10Chapter returns for them.',
      ]
    : [
        '--   No chapter column: ICD-9-CM procedure chapters do not map to a clean',
        '--   lexicographic range the way ICD-10 chapters do, so only the two-digit',
        '--   category is derived.',
      ];
  return [
    `-- The official SATUSEHAT ${catalog.label} catalog (${catalog.version}).`,
    '--',
    '-- GENERATED FILE. Do not edit by hand; regenerate with',
    `--   pnpm --filter @hms/api terminology:build -- ${catalog.idPrefix} <export.csv>`,
    '-- (apps/api/src/scripts/build-terminology-seed.ts). See',
    '-- docs/ops/terminology-master-data.md for the procedure and the dataset notes.',
    '--',
    `-- Source:  ${catalog.sourceUrl}`,
    `--          (the spreadsheet that page links to, saved as CSV; the export`,
    '--          itself is not committed, only this transformation)',
    `-- Index:   ${TERMINOLOGY_PAGE_URL}`,
    `-- Rows:    ${rows.length}`,
    ...chapterNote,
    '--',
    '-- Run by `pnpm db:seed` after seed.sql, and idempotent: every statement',
    '-- upserts on the code and only touches a row whose title, category, chapter',
    '-- or active flag changed. `display_indonesian` is never written, so the',
    '-- working Indonesian titles seed.sql curates for common codes survive every',
    '-- re-run. Codes absent from a newer export are left in place — a code a',
    '-- signed diagnosis points at is deactivated by hand, never removed by a',
    '-- seed (the importer, which owns a live catalog, is the one that deactivates).',
    '',
  ].join('\n');
}

function buildSeed(options: SeedBuildOptions): string {
  const catalog = TERMINOLOGY_CATALOGS[options.catalogName];
  if (!catalog) {
    throw new Error(`Unknown catalog ${options.catalogName}`);
  }
  const rows = readTerminologyRows(options.sourcePath, catalog);
  const statements: string[] = [];
  for (let offset = 0; offset < rows.length; offset += ROWS_PER_STATEMENT) {
    statements.push(renderUpsert(catalog, rows.slice(offset, offset + ROWS_PER_STATEMENT)));
  }
  return [renderHeader(catalog, rows), 'BEGIN;', '', ...statements, '', 'COMMIT;', ''].join('\n');
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const seed = buildSeed(options);
  writeFileSync(options.outputPath, seed, 'utf8');
  process.stdout.write(`Wrote ${options.outputPath} (${seed.length} bytes)\n`);
}

main();
