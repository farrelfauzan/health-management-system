import { writeFileSync } from 'node:fs';

import { Pool } from 'pg';

import { buildDraftPatientCsv, buildDraftPatientReport } from './build-draft-patient-report';
import { DraftPatientReport, DraftPatientRow } from './draft-patient-report.types';

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hms_dev?schema=public';
const DEFAULT_CSV_PATH = 'draft-patient-report.csv';

/**
 * Step 1 of `P17-T05`, and the one that has to happen before anything is
 * designed further: **what is actually in the table?**
 *
 * Two questions, and they are not the same question:
 *
 * 1. *What would the drain (release 2) move?* Every `CHANNEL_BOOKING` profile,
 *    split by whether anybody ever attended on it. Inert records become
 *    `ProspectivePatient` rows; attended ones stay and the front desk completes
 *    them, because moving encounters and invoices between records is not
 *    something a migration gets to do.
 *
 * 2. *What would stop the tightening (release 3)?* Every row in the table with
 *    a null `date_of_birth`, `sex` or `address` — **any source, soft-deleted
 *    included**. `NOT NULL` is table-wide, so a retired record fails the
 *    migration exactly as loudly as a live one, and the drain only reaches
 *    chat-created records. Anything blocking outside that scope needs a human
 *    before release 3 can be scheduled at all.
 *
 * **Mutates nothing.** Every statement below is a `SELECT`, and the CSV carries
 * MRNs and dispositions rather than demographics: the output of this script is
 * a work list, not a patient-data extract.
 *
 * Usage: `pnpm --filter @hms/api report:draft-patients [--csv=path]`
 */
async function reportDraftPatients(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  try {
    const { rows } = await pool.query<DraftPatientRow>(DRAFT_PATIENT_QUERY);
    const report = buildDraftPatientReport(rows);
    printReport(report);
    const csvPath = resolveCsvPath(process.argv.slice(2));
    writeFileSync(csvPath, `${buildDraftPatientCsv(rows)}\n`, 'utf8');
    console.log(`\nAffected records written to ${csvPath}`);
  } finally {
    await pool.end();
  }
}

/**
 * One row per patient profile, with the four facts the drain and the tightening
 * each turn on.
 *
 * `EXISTS` rather than joins, so a record with forty encounters costs the same
 * as one with a single invoice and nothing is double-counted. Soft-deleted
 * rows are read too — see the `NOT NULL` note above.
 */
const DRAFT_PATIENT_QUERY = `
  SELECT p."id",
         p."mrn",
         p."source"::text                       AS "source",
         (p."deleted_at" IS NOT NULL)           AS "isSoftDeleted",
         (p."date_of_birth" IS NOT NULL)        AS "hasDateOfBirth",
         (p."sex" IS NOT NULL)                  AS "hasSex",
         (p."address" IS NOT NULL AND btrim(p."address") <> '') AS "hasAddress",
         (EXISTS (SELECT 1 FROM "encounters" e     WHERE e."patient_id" = p."id")
       OR EXISTS (SELECT 1 FROM "registrations" r  WHERE r."patient_id" = p."id")
       OR EXISTS (SELECT 1 FROM "prescriptions" x  WHERE x."patient_id" = p."id")
       OR EXISTS (SELECT 1 FROM "invoices" i       WHERE i."patient_id" = p."id"))
                                                AS "hasClinicalActivity",
         EXISTS (SELECT 1 FROM "patient_privacy_notice_records" n
                  WHERE n."patient_id" = p."id") AS "hasPrivacyEvidence",
         (SELECT COUNT(*)::int FROM "appointments" a
           WHERE a."patient_id" = p."id" AND a."deleted_at" IS NULL) AS "appointmentCount",
         (SELECT COUNT(*)::int FROM "channel_patient_links" l
           WHERE l."patient_id" = p."id")        AS "channelLinkCount"
    FROM "patient_profiles" p
   ORDER BY p."source", p."mrn"
`;

function printReport(report: DraftPatientReport): void {
  console.log('=== P17-T05 drain dry run (read-only) ===\n');
  console.log(`CHANNEL_BOOKING profiles: ${report.channelBookingTotal}`);
  console.log(`  convert to prospective (no clinical activity): ${report.convert.count}`);
  console.log(`  keep for the front desk (attended):            ${report.keep.count}`);
  console.log(`  appointments the drain would repoint:          ${report.appointmentsToRepoint}`);
  console.log(`  chat links the drain would repoint:            ${report.channelLinksToRepoint}`);

  if (report.convertBlockedByPrivacyEvidence.count > 0) {
    // The finding this dry run exists to catch. `PCS-T08` already concluded a
    // chat draft cannot be hard-deleted for exactly this reason; if the number
    // below is not zero, the drain has to retire the profile the way the merge
    // does rather than remove it, and the ticket's wording needs amending
    // before release 2 is written.
    console.log(
      `\n!! ${report.convertBlockedByPrivacyEvidence.count} of those carry immutable privacy-notice evidence.` +
        '\n   Their PatientProfile row CANNOT be deleted: the FK is ON DELETE RESTRICT and the' +
        '\n   evidence table has a BEFORE UPDATE OR DELETE trigger. The drain must soft-delete' +
        '\n   and deactivate the profile instead, as the PCS-T08 merge already does.' +
        `\n   MRNs: ${formatMrns(report.convertBlockedByPrivacyEvidence.mrns)}`,
    );
  }

  console.log(`\nRows that would abort the NOT NULL tightening: ${report.tightenBlockers.count}`);
  console.log(`  by column — dateOfBirth ${report.tightenBlockersByColumn.dateOfBirth},` +
    ` sex ${report.tightenBlockersByColumn.sex},` +
    ` address ${report.tightenBlockersByColumn.address}`);
  for (const [source, count] of Object.entries(report.tightenBlockersBySource)) {
    console.log(`  by source — ${source}: ${count}`);
  }

  if (report.tightenBlockersOutsideDrainScope.count > 0) {
    console.log(
      `\n!! ${report.tightenBlockersOutsideDrainScope.count} blocking row(s) the drain cannot fix.` +
        '\n   The drain only reaches CHANNEL_BOOKING records with no clinical activity. These need' +
        '\n   a person to complete them before release 3 can be scheduled.' +
        `\n   MRNs: ${formatMrns(report.tightenBlockersOutsideDrainScope.mrns)}`,
    );
  } else {
    console.log('\nNo blocking row falls outside the drain’s reach.');
  }

  console.log(
    report.tightenBlockers.count === 0
      ? '\nRelease 3 (NOT NULL) would run clean against this database right now.'
      : '\nRelease 3 (NOT NULL) would ABORT against this database.',
  );
}

/** Enough ids to act on, without pasting a thousand-line list into a terminal. */
const MAX_PRINTED_MRNS = 20;

function formatMrns(mrns: string[]): string {
  if (mrns.length <= MAX_PRINTED_MRNS) {
    return mrns.join(', ');
  }
  return `${mrns.slice(0, MAX_PRINTED_MRNS).join(', ')} … and ${mrns.length - MAX_PRINTED_MRNS} more (see the CSV)`;
}

function resolveCsvPath(args: string[]): string {
  const flag = args.find((arg) => arg.startsWith('--csv='));
  return flag === undefined ? DEFAULT_CSV_PATH : flag.slice('--csv='.length);
}

reportDraftPatients().catch((err: unknown) => {
  console.error('Draft patient report failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
