import { readFileSync } from 'node:fs';

import { deriveIcd10Chapter } from '@hms/shared-types';
import { Pool } from 'pg';

import { parseCsvRows } from './parse-csv-rows';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';

type TerminologyCatalog = {
  readonly table: string;
  readonly hasChapter: boolean;
};

/**
 * The catalogs this importer can load. Both share the same shape — code,
 * English title, optional Indonesian title, derived category — and differ only
 * in whether a chapter is derivable. ICD-9-CM procedure chapters do not follow
 * a clean lexicographic range, so only ICD-10 carries one.
 */
const TERMINOLOGY_CATALOGS: Record<string, TerminologyCatalog> = {
  icd10: { table: 'icd10_codes', hasChapter: true },
  icd9cm: { table: 'icd9cm_codes', hasChapter: false },
};

type TerminologyImportRow = {
  code: string;
  display: string;
  displayIndonesian: string | null;
};

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z]/g, '');
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.includes(header));
}

/**
 * Reads the CSV into validated rows. Requires a header line naming at least a
 * code column and an English title column; the Indonesian title is optional.
 */
function readTerminologyRows(filePath: string): TerminologyImportRow[] {
  const rows = parseCsvRows(readFileSync(filePath, 'utf8')).filter((row) =>
    row.some((field) => field.trim().length > 0),
  );
  if (rows.length < 2) {
    throw new Error('The file needs a header line and at least one code row.');
  }
  const headers = (rows[0] ?? []).map(normaliseHeader);
  const codeIndex = findColumnIndex(headers, ['code', 'icdcode', 'kode']);
  const displayIndex = findColumnIndex(headers, ['display', 'title', 'displayen', 'name']);
  const indonesianIndex = findColumnIndex(headers, [
    'displayindonesian',
    'displayid',
    'indonesian',
    'namaindonesia',
    'titleid',
  ]);
  if (codeIndex === -1 || displayIndex === -1) {
    throw new Error(
      `Could not find a code column and a display column. Found: ${headers.join(', ')}`,
    );
  }
  const imported: TerminologyImportRow[] = [];
  const seenCodes = new Set<string>();
  rows.slice(1).forEach((row, rowOffset) => {
    const code = (row[codeIndex] ?? '').trim().toUpperCase();
    const display = (row[displayIndex] ?? '').trim();
    if (code.length === 0 || display.length === 0) {
      throw new Error(`Line ${rowOffset + 2} is missing a code or a display title.`);
    }
    if (seenCodes.has(code)) {
      throw new Error(`Line ${rowOffset + 2} repeats code ${code}.`);
    }
    seenCodes.add(code);
    const displayIndonesian =
      indonesianIndex === -1 ? '' : (row[indonesianIndex] ?? '').trim();
    imported.push({
      code,
      display,
      displayIndonesian: displayIndonesian.length > 0 ? displayIndonesian : null,
    });
  });
  return imported;
}

function buildUpsertStatement(catalog: TerminologyCatalog): string {
  const chapterColumn = catalog.hasChapter ? ', "chapter"' : '';
  const chapterValue = catalog.hasChapter ? ', source.chapter' : '';
  const chapterAssignment = catalog.hasChapter ? '"chapter" = EXCLUDED."chapter",' : '';
  return `INSERT INTO "${catalog.table}" (
            "id", "code", "display", "display_indonesian", "category"${chapterColumn},
            "is_active", "created_at", "updated_at", "deleted_at"
          )
          SELECT
            gen_random_uuid(), source.code, source.display, source.display_indonesian,
            split_part(source.code, '.', 1)${chapterValue}, true, NOW(), NOW(), NULL
          FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
            AS source(code, display, display_indonesian, chapter)
          ON CONFLICT ("code") DO UPDATE
          SET "display" = EXCLUDED."display",
              "display_indonesian" = EXCLUDED."display_indonesian",
              "category" = EXCLUDED."category",
              ${chapterAssignment}
              "is_active" = true,
              "updated_at" = NOW(),
              "deleted_at" = NULL
          RETURNING (xmax = 0) AS inserted`;
}

/**
 * Replaces a terminology catalog with an official list.
 *
 * Codes in the file are upserted and activated; codes absent from it are
 * deactivated rather than deleted, because historic diagnoses and procedures
 * must keep resolving the code they were signed with. The whole run is one
 * transaction, so a malformed file leaves the catalog untouched.
 */
async function importTerminologyCodes(): Promise<void> {
  const catalogName = process.argv[2] ?? '';
  const filePath = process.argv[3];
  const catalog = TERMINOLOGY_CATALOGS[catalogName];
  if (!catalog || !filePath) {
    throw new Error(
      `Usage: pnpm --filter @hms/api <${Object.keys(TERMINOLOGY_CATALOGS).join('|')}>:import <file.csv>`,
    );
  }
  const rows = readTerminologyRows(filePath);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: upserted } = await client.query<{ inserted: boolean }>(
      buildUpsertStatement(catalog),
      [
        rows.map((row) => row.code),
        rows.map((row) => row.display),
        rows.map((row) => row.displayIndonesian),
        rows.map((row) => (catalog.hasChapter ? deriveIcd10Chapter(row.code) : null)),
      ],
    );
    const { rowCount: deactivatedCount } = await client.query(
      `UPDATE "${catalog.table}"
       SET "is_active" = false, "updated_at" = NOW()
       WHERE "is_active" = true AND NOT ("code" = ANY($1::text[]))`,
      [rows.map((row) => row.code)],
    );
    await client.query('COMMIT');
    const insertedCount = upserted.filter((row) => row.inserted).length;
    console.log(
      `Imported ${rows.length} ${catalogName} code(s): ${insertedCount} new, ${rows.length - insertedCount} updated, ${deactivatedCount ?? 0} deactivated.`,
    );
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

importTerminologyCodes().catch(() => {
  console.error('Terminology import failed');
  process.exit(1);
});
