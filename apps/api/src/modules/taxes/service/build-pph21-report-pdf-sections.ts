import {
  BuildTaxReportPdfSectionsParams,
  CLINICIAN_TAX_IDENTITY_INCOMPLETE_LABEL,
  Pph21ReportLine,
  Pph21ReportSummary,
  TaxReportPdfValueFormatter,
} from '@hms/shared-types';

import { buildTaxReportPdfSummary } from './build-tax-report-pdf-summary';
import { buildTaxReportPdfTable } from './build-tax-report-pdf-table';

const EMPTY_MONTH_MARKUP = '<p class="muted">Tidak ada jasa medis dibayarkan di bulan ini.</p>';
const INCOMPLETE_IDENTITY_MARKUP =
  '<p class="muted">Penerima dengan identitas pajak belum lengkap tidak dapat dibuatkan bukti potong; lengkapi NPWP atau NIK pada profil tenaga klinis, lalu hitung ulang.</p>';

/**
 * The PPh 21 bukan pegawai part of the tax report PDF (P27-T07): the month's
 * summary with the billing code and both due dates, then one BP21 row per
 * clinician. Identities print masked — the PDF is stored as a file and may
 * never hold a plaintext NIK; the full number is the audited CSV export.
 */
export function buildPph21ReportPdfSections(params: BuildTaxReportPdfSectionsParams): string {
  const summary = params.report.summary as Pph21ReportSummary;
  const lines = params.report.lines as Pph21ReportLine[];
  return [
    '<h2>Ringkasan</h2>',
    buildSummaryBlock(summary, params.format),
    `<h2>Bukti potong per penerima (${lines.length})</h2>`,
    lines.length === 0 ? EMPTY_MONTH_MARKUP : buildLineTable(summary, lines, params.format),
    summary.incompleteIdentityCount > 0 ? INCOMPLETE_IDENTITY_MARKUP : '',
  ].join('');
}

function buildSummaryBlock(
  summary: Pph21ReportSummary,
  format: TaxReportPdfValueFormatter,
): string {
  return buildTaxReportPdfSummary([
    { label: 'Jumlah bruto jasa medis', value: format.rupiah(summary.totals.grossFee) },
    {
      label: 'DPP',
      value: `${summary.dppPercent}% × bruto = ${format.rupiah(summary.totals.taxBase)}`,
    },
    {
      label: 'Tarif Pasal 17 berlaku sejak',
      value: format.calendarDate(summary.bracketsEffectiveFrom),
    },
    {
      label: 'PPh 21 dipotong',
      value: format.rupiah(summary.totals.taxAmount),
      isEmphasised: true,
    },
    { label: 'Penerima penghasilan', value: String(summary.clinicianCount) },
    { label: 'Identitas pajak belum lengkap', value: String(summary.incompleteIdentityCount) },
    {
      label: 'Kode billing',
      value: `KAP ${summary.taxAccountCode} / KJS ${summary.depositTypeCode}`,
    },
    { label: 'Batas setor', value: format.calendarDate(summary.paymentDueDate) },
    {
      label: 'Batas lapor SPT Masa PPh 21/26',
      value: format.calendarDate(summary.reportingDueDate),
    },
  ]);
}

function buildLineTable(
  summary: Pph21ReportSummary,
  lines: readonly Pph21ReportLine[],
  format: TaxReportPdfValueFormatter,
): string {
  return buildTaxReportPdfTable({
    headers: ['No', 'Penerima', 'Identitas', 'Bruto', 'DPP', 'PPh 21'],
    rows: lines.map((line, index) => [
      String(index + 1),
      line.doctorName,
      line.identityStatus === 'MISSING'
        ? CLINICIAN_TAX_IDENTITY_INCOMPLETE_LABEL
        : `${line.identityStatus} ${line.identityMasked ?? ''}`,
      format.rupiah(line.grossFee),
      format.rupiah(line.taxBase),
      format.rupiah(line.taxAmount),
    ]),
    numericColumns: [0, 3, 4, 5],
    totalRow: [
      '',
      'Total',
      '',
      format.rupiah(summary.totals.grossFee),
      format.rupiah(summary.totals.taxBase),
      format.rupiah(summary.totals.taxAmount),
    ],
  });
}
