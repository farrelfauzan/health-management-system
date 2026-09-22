import {
  CLINICIAN_TAX_IDENTITY_INCOMPLETE_LABEL,
  ClinicianTaxIdentifier,
  Pp55ReportLine,
  Pph21ReportLine,
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
  PPH21_NON_EMPLOYEE: 'PPh 21 Bukan Pegawai (jasa medis)',
};

type BuildTaxReportCsvParams = {
  report: TaxReportRecord;
  /**
   * The full NPWP or NIK per clinician for a PPh 21 export (P27-T07), read
   * and audited by the caller; the stored draft holds only the masked form.
   */
  identifiers?: readonly ClinicianTaxIdentifier[];
};

/**
 * The CSV of one monthly report (P27-T05): a header block with the totals and
 * due dates, then one row per payment or invoice — or, for PPh 21 (P27-T07),
 * one BP21 row per clinician. Figures are plain numbers so the accountant's
 * spreadsheet sums them; the totals equal the draft to the rupiah because
 * both come from the same stored snapshot.
 */
export function buildTaxReportCsv({ report, identifiers = [] }: BuildTaxReportCsvParams): string {
  const rows: string[][] = [
    ['Laporan', KIND_LABELS[report.kind]],
    ['Periode', report.period],
    ['Status', report.status],
    ['Catatan', 'Draft — bukan pelaporan resmi. Setor dan laporkan melalui Coretax DJP.'],
    ...buildSummaryRows(report),
    [],
    ...buildLineRows(report.kind, report.lines, identifiers),
  ];
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

function buildSummaryRows(report: TaxReportRecord): string[][] {
  const summary = report.summary;
  if (summary.kind === 'PPH21_NON_EMPLOYEE') {
    return [
      ['Jumlah bruto jasa medis', String(summary.totals.grossFee)],
      ['DPP (%)', String(summary.dppPercent)],
      ['DPP', String(summary.totals.taxBase)],
      ['Tarif berlaku sejak', summary.bracketsEffectiveFrom],
      ['PPh 21 dipotong', String(summary.totals.taxAmount)],
      ['Penerima penghasilan', String(summary.clinicianCount)],
      ['Identitas pajak belum lengkap', String(summary.incompleteIdentityCount)],
      ['Kode billing (KAP-KJS)', `${summary.taxAccountCode}-${summary.depositTypeCode}`],
      ['Batas setor', summary.paymentDueDate],
      ['Batas lapor SPT Masa PPh 21/26', summary.reportingDueDate],
    ];
  }
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

function buildLineRows(
  kind: TaxReportRecord['kind'],
  lines: TaxReportLine[],
  identifiers: readonly ClinicianTaxIdentifier[],
): string[][] {
  if (kind === 'PPH21_NON_EMPLOYEE') {
    return buildPph21LineRows(lines as Pph21ReportLine[], identifiers);
  }
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

/**
 * One BP21 row per clinician. The identity column carries the full NPWP or
 * NIK when the caller supplied it, the flag when the clinician has neither —
 * a bukti potong without a tax number cannot be entered in Coretax.
 */
function buildPph21LineRows(
  lines: readonly Pph21ReportLine[],
  identifiers: readonly ClinicianTaxIdentifier[],
): string[][] {
  const identifierById = new Map(identifiers.map((entry) => [entry.doctorId, entry]));
  return [
    [
      'Penerima',
      'Profesi',
      'Jenis identitas',
      'NPWP/NIK',
      'Jumlah baris',
      'Bruto jasa medis',
      'DPP',
      'PPh 21',
    ],
    ...lines.map((line) => {
      const identifier = identifierById.get(line.doctorId);
      return [
        line.doctorName,
        line.profession,
        identifier?.identityKind ?? line.identityStatus,
        identifier?.taxIdentityNumber ??
          (line.identityStatus === 'MISSING'
            ? CLINICIAN_TAX_IDENTITY_INCOMPLETE_LABEL
            : (line.identityMasked ?? '')),
        String(line.entryCount),
        String(line.grossFee),
        String(line.taxBase),
        String(line.taxAmount),
      ];
    }),
  ];
}

function escapeCsvCell(value: string): string {
  const neutralised = FORMULA_LEAD_CHARACTERS.has(value.charAt(0)) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replaceAll('"', '""')}"` : neutralised;
}
