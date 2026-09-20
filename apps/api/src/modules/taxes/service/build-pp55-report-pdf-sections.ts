import {
  BuildTaxReportPdfSectionsParams,
  Pp55ReportLine,
  Pp55ReportSummary,
  TaxReportPdfValueFormatter,
} from '@hms/shared-types';

import { buildTaxReportPdfSummary } from './build-tax-report-pdf-summary';
import { buildTaxReportPdfTable } from './build-tax-report-pdf-table';

const EMPTY_MONTH_MARKUP = '<p class="muted">Tidak ada pembayaran diterima di bulan ini.</p>';

/**
 * The PP 55 part of the tax report PDF (P27-T12): the summary with the
 * billing code and due dates, then every payment received in the month.
 * Figures come from the stored report, so they equal the screen and the CSV
 * to the rupiah.
 */
export function buildPp55ReportPdfSections(params: BuildTaxReportPdfSectionsParams): string {
  const summary = params.report.summary as Pp55ReportSummary;
  const lines = params.report.lines as Pp55ReportLine[];
  return [
    '<h2>Ringkasan</h2>',
    buildSummaryBlock(summary, params.format),
    `<h2>Pembayaran diterima (${lines.length})</h2>`,
    lines.length === 0 ? EMPTY_MONTH_MARKUP : buildPaymentTable(summary, lines, params.format),
  ].join('');
}

function buildSummaryBlock(summary: Pp55ReportSummary, format: TaxReportPdfValueFormatter): string {
  return buildTaxReportPdfSummary([
    { label: 'Omzet bruto (pembayaran diterima)', value: format.rupiah(summary.totals.grossOmzet) },
    { label: 'Omzet sebelumnya tahun ini', value: format.rupiah(summary.yearToDateOmzetBefore) },
    {
      label: 'Omzet tidak kena pajak terpakai (orang pribadi, Rp500 juta setahun)',
      value: format.rupiah(summary.nonTaxableAllowanceUsed),
    },
    { label: 'Omzet kena pajak', value: format.rupiah(summary.totals.taxableOmzet) },
    { label: 'Tarif', value: `${String(summary.ratePercent).replace('.', ',')}%` },
    {
      label: 'PPh final terutang',
      value: format.rupiah(summary.totals.taxDue),
      isEmphasised: true,
    },
    {
      label: 'Kode billing',
      value: `KAP ${summary.taxAccountCode} / KJS ${summary.depositTypeCode}`,
    },
    { label: 'Batas setor', value: format.calendarDate(summary.paymentDueDate) },
    { label: 'Batas lapor', value: format.calendarDate(summary.reportingDueDate) },
  ]);
}

function buildPaymentTable(
  summary: Pp55ReportSummary,
  lines: readonly Pp55ReportLine[],
  format: TaxReportPdfValueFormatter,
): string {
  return buildTaxReportPdfTable({
    headers: ['No', 'Invoice', 'Dibayar', 'Metode', 'Jumlah'],
    rows: lines.map((line, index) => [
      String(index + 1),
      line.invoiceNumber,
      format.instant(line.paidAt),
      line.method,
      format.rupiah(line.amount),
    ]),
    numericColumns: [0, 4],
    totalRow: ['', 'Total', '', '', format.rupiah(summary.totals.grossOmzet)],
  });
}
