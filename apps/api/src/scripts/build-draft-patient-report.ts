import {
  DraftPatientDisposition,
  DraftPatientReport,
  DraftPatientRow,
} from './draft-patient-report.types';

const CHANNEL_BOOKING_SOURCE = 'CHANNEL_BOOKING';

/**
 * What the drain would do with one row (`P17-T05`).
 *
 * Clinical activity is the whole test, and it is deliberately generous about
 * what counts: an encounter, a registration, a prescription or an invoice all
 * mean a human dealt with this person. A migration that moved any of those
 * between records would be rewriting a clinical history to tidy a table.
 */
export function resolveDisposition(row: DraftPatientRow): DraftPatientDisposition {
  if (row.source !== CHANNEL_BOOKING_SOURCE) {
    return 'OUT_OF_SCOPE';
  }
  return row.hasClinicalActivity ? 'KEEP' : 'CONVERT';
}

/**
 * Whether this row would abort the `NOT NULL` tightening (release 3).
 *
 * Soft-deleted rows are **not** excluded. `NOT NULL` is a table-wide
 * constraint: a retired record with a null birth date fails the migration
 * exactly as loudly as a live one, and a dry run that filtered on
 * `deleted_at IS NULL` would report all-clear and then watch the deploy fail.
 */
export function blocksTighten(row: DraftPatientRow): boolean {
  return !row.hasDateOfBirth || !row.hasSex || !row.hasAddress;
}

/**
 * Turns the table into the two questions release 2 and release 3 each need
 * answered (`P17-T05`).
 *
 * Pure, so the counting rules can be argued with in a unit test rather than by
 * running a script against a database nobody wants to reproduce. The script
 * around it does the SQL and the printing and nothing else.
 */
export function buildDraftPatientReport(rows: DraftPatientRow[]): DraftPatientReport {
  const channelBookingRows = rows.filter((row) => row.source === CHANNEL_BOOKING_SOURCE);
  const convertRows = channelBookingRows.filter((row) => resolveDisposition(row) === 'CONVERT');
  const keepRows = channelBookingRows.filter((row) => resolveDisposition(row) === 'KEEP');
  const blockedConvertRows = convertRows.filter((row) => row.hasPrivacyEvidence);
  const blockingRows = rows.filter(blocksTighten);
  return {
    channelBookingTotal: channelBookingRows.length,
    convert: toBucket(convertRows),
    keep: toBucket(keepRows),
    convertBlockedByPrivacyEvidence: toBucket(blockedConvertRows),
    appointmentsToRepoint: sumBy(convertRows, (row) => row.appointmentCount),
    channelLinksToRepoint: sumBy(convertRows, (row) => row.channelLinkCount),
    tightenBlockers: toBucket(blockingRows),
    tightenBlockersBySource: countBySource(blockingRows),
    tightenBlockersByColumn: {
      dateOfBirth: blockingRows.filter((row) => !row.hasDateOfBirth).length,
      sex: blockingRows.filter((row) => !row.hasSex).length,
      address: blockingRows.filter((row) => !row.hasAddress).length,
    },
    // A blocking row the drain would convert stops being a row at all, so it
    // is not counted here. Everything else — an attended chat record, or any
    // front-desk record somebody left half-filled — needs a person before
    // release 3 can be scheduled.
    tightenBlockersOutsideDrainScope: toBucket(
      blockingRows.filter((row) => resolveDisposition(row) !== 'CONVERT'),
    ),
  };
}

/**
 * The affected records as a CSV an operator can hand to the front desk.
 *
 * MRNs and dispositions, never demographics: the point of the file is "these
 * are the folders somebody has to deal with", and a dry run that exported
 * dates of birth would be a patient-data extract sitting in a shell history.
 */
export function buildDraftPatientCsv(rows: DraftPatientRow[]): string {
  const header = 'mrn,source,disposition,softDeleted,blocksTighten,missing,appointments,privacyEvidence';
  const lines = rows
    .filter((row) => resolveDisposition(row) !== 'OUT_OF_SCOPE' || blocksTighten(row))
    .map((row) =>
      [
        row.mrn,
        row.source,
        resolveDisposition(row),
        String(row.isSoftDeleted),
        String(blocksTighten(row)),
        listMissingColumns(row).join(' '),
        String(row.appointmentCount),
        String(row.hasPrivacyEvidence),
      ].join(','),
    );
  return [header, ...lines].join('\n');
}

function listMissingColumns(row: DraftPatientRow): string[] {
  return [
    ...(row.hasDateOfBirth ? [] : ['dateOfBirth']),
    ...(row.hasSex ? [] : ['sex']),
    ...(row.hasAddress ? [] : ['address']),
  ];
}

function toBucket(rows: DraftPatientRow[]) {
  return { count: rows.length, mrns: rows.map((row) => row.mrn) };
}

function countBySource(rows: DraftPatientRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.source] = (counts[row.source] ?? 0) + 1;
    return counts;
  }, {});
}

function sumBy(rows: DraftPatientRow[], read: (row: DraftPatientRow) => number): number {
  return rows.reduce((total, row) => total + read(row), 0);
}
