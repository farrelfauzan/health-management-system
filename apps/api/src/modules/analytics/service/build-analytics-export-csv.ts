import type { AnalyticsExportCell, BuildAnalyticsExportCsvParams } from '@hms/shared-types';

// Excel opens a CSV as the machine's code page unless it starts with a BOM,
// which would turn every "é" in a clinician's name into two characters.
const UTF8_BOM = '\uFEFF';
const LINE_BREAK = '\r\n';

/**
 * Cells a spreadsheet would evaluate rather than display. Text that starts
 * with one is prefixed with a quote, so a poli someone named `=HYPERLINK(...)`
 * opens as text. Numbers are left alone: a negative change is a number.
 */
const FORMULA_LEAD_CHARACTERS = new Set(['=', '+', '-', '@', '\t', '\r']);

function escapeCell(cell: AnalyticsExportCell): string {
  if (cell === null) {
    return '';
  }
  if (typeof cell === 'number') {
    return String(cell);
  }
  const neutralised = FORMULA_LEAD_CHARACTERS.has(cell.charAt(0)) ? `'${cell}` : cell;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replaceAll('"', '""')}"` : neutralised;
}

function toLine(cells: readonly AnalyticsExportCell[]): string {
  return cells.map(escapeCell).join(',');
}

/**
 * A dashboard's CSV (P29-T10): who and what it is for at the top, then one
 * section per table (its title, its header, its rows) with a blank line
 * between sections. UTF-8 with a BOM and CRLF line ends, so Excel on a clinic
 * PC opens it straight.
 */
export function buildAnalyticsExportCsv({
  dashboardTitle,
  meta,
  filterLines,
  tables,
}: BuildAnalyticsExportCsvParams): string {
  const header: AnalyticsExportCell[][] = [
    ['MetaKlinik', dashboardTitle],
    ['Periode', `${meta.from} s.d. ${meta.to}`],
    ['Zona waktu', meta.timezone],
    ['Data per', meta.generatedAt],
    ...filterLines,
  ];
  const sections = tables.map((table) =>
    [[table.title], table.columns, ...table.rows].map(toLine).join(LINE_BREAK),
  );
  return `${UTF8_BOM}${[header.map(toLine).join(LINE_BREAK), ...sections].join(
    `${LINE_BREAK}${LINE_BREAK}`,
  )}${LINE_BREAK}`;
}
