/** Excel reads a UTF-8 file as Latin-1 unless it starts with this mark. */
const UTF8_BYTE_ORDER_MARK = '﻿';

/**
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet evaluate the cell; the
 * register is opened in Excel at the puskesmas, so every value is neutralised
 * the way the tax and document exports do it.
 */
const FORMULA_LEAD_CHARACTERS = new Set(['=', '+', '-', '@', '\t', '\r']);

function escapeCsvCell(value: string): string {
  const neutralised = FORMULA_LEAD_CHARACTERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replaceAll('"', '""')}"` : neutralised;
}

/**
 * Rows of cells as a CSV file (P25-T15): UTF-8 with a byte order mark so the
 * Indonesian text survives Excel, CRLF line ends, and a trailing newline. An
 * empty row prints as a blank line, which is how the header block is kept
 * apart from the table.
 */
export function buildMaternalReportCsv(rows: readonly (readonly string[])[]): string {
  const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  return `${UTF8_BYTE_ORDER_MARK}${body}\r\n`;
}
