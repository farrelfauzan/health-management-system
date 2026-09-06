import { ManagedDocumentRecord } from '@hms/shared-types';

const CSV_HEADER = [
  'id',
  'typeCode',
  'typeName',
  'title',
  'documentNumber',
  'status',
  'patient',
  'doctor',
  'draftedBy',
  'createdAt',
  'issuedAt',
] as const;

/**
 * Cells a spreadsheet would evaluate rather than display. Prefixed with a
 * quote so a title someone typed as `=HYPERLINK(...)` opens as text in the
 * surveyor's Excel rather than as a formula — the export is metadata for
 * an audit, and an audit must not run code.
 */
const FORMULA_LEAD_CHARACTERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * The registry export (`P16-T28`, FR-E5-07): one line per document, metadata
 * only. No `contentHtml`, no storage key — a CSV that carried the documents
 * themselves would be the bulk disclosure the requirement forbids.
 */
export function buildManagedDocumentCsv(records: readonly ManagedDocumentRecord[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const record of records) {
    lines.push(
      [
        record.id,
        record.type.code,
        record.type.name,
        record.title,
        record.documentNumber ?? '',
        record.status,
        record.patient?.fullName ?? '',
        record.doctor?.fullName ?? '',
        record.draftedBy.email,
        record.createdAt.toISOString(),
        record.issuedAt?.toISOString() ?? '',
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function escapeCsvCell(value: string): string {
  const neutralised = FORMULA_LEAD_CHARACTERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replaceAll('"', '""')}"` : neutralised;
}
