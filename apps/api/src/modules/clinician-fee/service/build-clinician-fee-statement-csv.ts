import { ClinicianFeeStatementView } from '@hms/shared-types';

/**
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet evaluate the cell, so
 * every text cell is neutralised the way the tax report export does it.
 * Amounts stay plain numbers — a reversal's minus sign is data, and the
 * accountant's spreadsheet must still sum the column.
 */
const FORMULA_LEAD_CHARACTERS = new Set(['=', '+', '-', '@']);

const KIND_LABELS: Readonly<Record<ClinicianFeeStatementView['entries'][number]['kind'], string>> =
  {
    ACCRUAL: 'Pembayaran',
    REVERSAL: 'Pembatalan',
  };

type CsvCell = string | number;

function escapeCsvCell(value: CsvCell): string {
  if (typeof value === 'number') {
    return String(value);
  }
  const neutralised = FORMULA_LEAD_CHARACTERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replaceAll('"', '""')}"` : neutralised;
}

function buildEntryRows(statement: ClinicianFeeStatementView): CsvCell[][] {
  return statement.entries.map((entry) => [
    entry.occurredAt,
    KIND_LABELS[entry.kind],
    entry.invoiceNumber,
    entry.description,
    entry.quantity,
    entry.ruleMode === 'PERCENT' ? `${entry.ruleValue}%` : `Rp${entry.ruleValue}/unit`,
    entry.lineAmount,
    entry.grossFee,
    entry.clinicShare,
  ]);
}

/**
 * One clinician's monthly jasa medis statement as CSV (P27-T06): a header
 * block with the totals, then one row per ledger entry. The totals equal the
 * on-screen statement to the rupiah because both come from the same entries.
 */
export function buildClinicianFeeStatementCsv(statement: ClinicianFeeStatementView): string {
  const rows: CsvCell[][] = [
    ['Laporan', 'Jasa medis'],
    ['Tenaga kesehatan', statement.doctorName],
    ['Periode', statement.period],
    ['Jumlah baris', statement.totals.entryCount],
    ['Total tagihan layanan', statement.totals.lineAmount],
    ['Total jasa medis (bruto)', statement.totals.grossFee],
    ['Total bagian klinik', statement.totals.clinicShare],
    [],
    [
      'Waktu',
      'Jenis',
      'No. invoice',
      'Layanan',
      'Jumlah',
      'Aturan',
      'Tagihan layanan',
      'Jasa medis (bruto)',
      'Bagian klinik',
    ],
    ...buildEntryRows(statement),
  ];
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}
