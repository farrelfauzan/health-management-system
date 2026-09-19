import {
  Pp55ReportLine,
  PpnOutputReportLine,
  TaxReportLine,
  TaxReportRecord,
} from '@hms/shared-types';

/**
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet evaluate the cell; the
 * report is opened in Excel by an accountant, so every value is neutralised
 * the way the documents export does it.
 */
const FORMULA_LEAD_CHARACTERS = new Set(['=', '+', '-', '@']);

const KIND_LABELS: Readonly<Record<TaxReportRecord['kind'], string>> = {
  PP55_OMZET: 'PPh Final PP 55 (0,5% omzet)',
  PPN_OUTPUT: 'PPN Keluaran',
};

/**
 * The CSV of one monthly report (P27-T05): a header block with the totals and
 * due dates, then one row per payment or invoice. Figures are plain numbers so
 * the accountant's spreadsheet sums them; the totals equal the draft to the
 * rupiah because both come from the same stored snapshot.
 */
export function buildTaxReportCsv(report: TaxReportRecord): string {
  const rows: string[][] = [
    ['Laporan', KIND_LABELS[report.kind]],
    ['Periode', report.period],
    ['Status', report.status],
    ['Catatan', 'Draft — bukan pelaporan resmi. Setor dan laporkan melalui Coretax DJP.'],
    ...buildSummaryRows(report),
    [],
    ...buildLineRows(report.kind, report.lines),
  ];
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

function buildSummaryRows(report: TaxReportRecord): string[][] {
  const summary = report.summary;
  if (summary.kind === 'PP55_OMZET') {
    return [
      ['Omzet bruto', String(summary.totals.grossOmzet)],
      ['Omzet tidak kena pajak terpakai', String(summary.nonTaxableAllowanceUsed)],
      ['Omzet kena pajak', String(summary.totals.taxableOmzet)],
      ['Tarif (%)', String(summary.ratePercent)],
      ['PPh final terutang', String(summary.totals.taxDue)],
      ['Kode billing (KAP-KJS)', `${summary.taxAccountCode}-${summary.depositTypeCode}`],
      ['Batas setor', summary.paymentDueDate],
    ];
  }
  return [
    ...summary.groups.map((group) => [
      `Kode faktur ${group.fakturTransactionCode}`,
      `DPP ${group.taxBase}`,
      `PPN ${group.taxAmount}`,
      `${group.invoiceCount} invoice`,
    ]),
    ['Total harga jual', String(summary.totals.taxableAmount)],
    ['Total DPP', String(summary.totals.taxBase)],
    ['Total PPN', String(summary.totals.taxAmount)],
    ['Baris tanpa kode pajak', String(summary.legacyLineCount)],
    ['Batas setor dan lapor', summary.paymentDueDate],
  ];
}

function buildLineRows(kind: TaxReportRecord['kind'], lines: TaxReportLine[]): string[][] {
  if (kind === 'PP55_OMZET') {
    return [
      ['No. invoice', 'Tanggal bayar', 'Metode', 'Jumlah'],
      ...(lines as Pp55ReportLine[]).map((line) => [
        line.invoiceNumber,
        line.paidAt,
        line.method,
        String(line.amount),
      ]),
    ];
  }
  return [
    ['No. invoice', 'Tanggal terbit', 'Kode faktur', 'Jumlah baris', 'Harga jual', 'DPP', 'PPN'],
    ...(lines as PpnOutputReportLine[]).map((line) => [
      line.invoiceNumber,
      line.issuedAt,
      line.fakturTransactionCode,
      String(line.lineCount),
      String(line.taxableAmount),
      String(line.taxBase),
      String(line.taxAmount),
    ]),
  ];
}

function escapeCsvCell(value: string): string {
  const neutralised = FORMULA_LEAD_CHARACTERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replaceAll('"', '""')}"` : neutralised;
}
