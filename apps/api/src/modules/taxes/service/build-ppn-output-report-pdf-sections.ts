import {
  BuildTaxReportPdfSectionsParams,
  PpnOutputReportLine,
  PpnOutputReportSummary,
  TaxReportPdfValueFormatter,
} from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';
import { buildTaxReportPdfSummary } from './build-tax-report-pdf-summary';
import { buildTaxReportPdfTable } from './build-tax-report-pdf-table';

const LEGACY_CODE = 'LEGACY';
const NOT_OBJECT_CODE = 'NOT_OBJECT';
const AMOUNT_COLUMNS = [2, 3, 4, 5];

/**
 * The PPN keluaran part of the tax report PDF (P27-T12): the summary, the
 * recap by faktur code, the invoices under each code, and — apart, outside
 * the totals — lines outside PPN and lines billed before the tax module.
 */
export function buildPpnOutputReportPdfSections(params: BuildTaxReportPdfSectionsParams): string {
  const summary = params.report.summary as PpnOutputReportSummary;
  const lines = params.report.lines as PpnOutputReportLine[];
  return [
    '<h2>Ringkasan</h2>',
    buildSummaryBlock(summary, params.format),
    '<p class="muted">Pembeli pasien eceran: faktur digunggung.</p>',
    '<h2>Rekap per kode faktur</h2>',
    buildGroupTable(summary, params.format),
    ...summary.groups.map((group) =>
      buildCodeSection(
        `Kode faktur ${group.fakturTransactionCode}`,
        group.fakturTransactionCode,
        lines,
        params.format,
      ),
    ),
    buildCodeSection('Bukan objek PPN — tidak masuk total', NOT_OBJECT_CODE, lines, params.format),
    buildCodeSection(
      'Tanpa kode pajak (ditagih sebelum modul pajak aktif) — tidak masuk total',
      LEGACY_CODE,
      lines,
      params.format,
    ),
  ].join('');
}

function buildSummaryBlock(
  summary: PpnOutputReportSummary,
  format: TaxReportPdfValueFormatter,
): string {
  return buildTaxReportPdfSummary([
    { label: 'Invoice terbit (tanpa VOID)', value: String(summary.invoiceCount) },
    { label: 'Total harga jual', value: format.rupiah(summary.totals.taxableAmount) },
    { label: 'Total DPP', value: format.rupiah(summary.totals.taxBase) },
    { label: 'Total PPN', value: format.rupiah(summary.totals.taxAmount), isEmphasised: true },
    {
      label: 'Bukan objek PPN',
      value: `${summary.notObjectLineCount} baris, ${format.rupiah(summary.notObjectAmount)}`,
    },
    {
      label: 'Tanpa kode pajak',
      value: `${summary.legacyLineCount} baris, ${format.rupiah(summary.legacyAmount)}`,
    },
    { label: 'Batas setor', value: format.calendarDate(summary.paymentDueDate) },
    { label: 'Batas lapor', value: format.calendarDate(summary.reportingDueDate) },
  ]);
}

function buildGroupTable(
  summary: PpnOutputReportSummary,
  format: TaxReportPdfValueFormatter,
): string {
  if (summary.groups.length === 0) {
    return '<p class="muted">Tidak ada invoice dengan kode pajak di bulan ini.</p>';
  }
  return buildTaxReportPdfTable({
    headers: ['Kode faktur', 'Invoice', 'Baris', 'Harga jual', 'DPP', 'PPN'],
    rows: summary.groups.map((group) => [
      group.fakturTransactionCode,
      String(group.invoiceCount),
      String(group.lineCount),
      format.rupiah(group.taxableAmount),
      format.rupiah(group.taxBase),
      format.rupiah(group.taxAmount),
    ]),
    numericColumns: [1, ...AMOUNT_COLUMNS],
    totalRow: [
      'Total',
      String(summary.invoiceCount),
      '',
      format.rupiah(summary.totals.taxableAmount),
      format.rupiah(summary.totals.taxBase),
      format.rupiah(summary.totals.taxAmount),
    ],
  });
}

/** One code's invoices; nothing at all when the code has none. */
function buildCodeSection(
  heading: string,
  code: string,
  lines: readonly PpnOutputReportLine[],
  format: TaxReportPdfValueFormatter,
): string {
  const members = lines.filter((line) => line.fakturTransactionCode === code);
  if (members.length === 0) {
    return '';
  }
  const table = buildTaxReportPdfTable({
    headers: ['Invoice', 'Terbit', 'Baris', 'Harga jual', 'DPP', 'PPN'],
    rows: members.map((line) => [
      line.invoiceNumber,
      format.instant(line.issuedAt),
      String(line.lineCount),
      format.rupiah(line.taxableAmount),
      format.rupiah(line.taxBase),
      format.rupiah(line.taxAmount),
    ]),
    numericColumns: AMOUNT_COLUMNS,
  });
  return `<h3>${escapeHtmlText(heading)}</h3>${table}`;
}
