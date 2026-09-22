import {
  ClinicReportingIdentity,
  NON_CAPITATION_LABELS,
  NON_CAPITATION_MAX_COACHING_FEE_PERCENT,
  NonCapitationRecapResponse,
} from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';
import { buildNonCapitationLineCells } from './build-non-capitation-line-cells';
import { NON_CAPITATION_FORMAT } from './format-non-capitation-values';
import { NON_CAPITATION_LINE_COLUMNS } from './non-capitation-line-columns';

const DOCUMENT_CSS = [
  '* { box-sizing: border-box; }',
  'body { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #111; margin: 0; overflow-wrap: anywhere; }',
  'header { border-bottom: 1.5pt solid #111; padding-bottom: 6pt; margin-bottom: 10pt; }',
  '.clinic-name { font-size: 13pt; font-weight: bold; }',
  '.meta { font-size: 8pt; color: #333; }',
  'h1 { font-size: 11pt; margin: 8pt 0 4pt; }',
  'h2 { font-size: 9.5pt; margin: 12pt 0 4pt; }',
  'p { margin: 3pt 0; }',
  '.notice { border: 1pt solid #b45309; background: #fffbeb; padding: 4pt 6pt; font-size: 8pt; margin: 6pt 0; }',
  'table { width: 100%; border-collapse: collapse; }',
  'thead { display: table-header-group; }',
  'tr { page-break-inside: avoid; }',
  'th, td { text-align: left; vertical-align: top; padding: 2pt 3pt; border: 0.5pt solid #999; font-size: 7pt; }',
  'thead th { background: #f1f5f9; }',
  'td.num { text-align: right; white-space: nowrap; }',
  '.signature { margin-top: 28pt; width: 45%; margin-left: auto; text-align: center; }',
  '.signature .line { margin-top: 40pt; border-top: 0.5pt solid #111; }',
].join('\n');

function buildLetterhead(identity: ClinicReportingIdentity): string {
  const contact = [identity.address, identity.phoneNumber]
    .filter((value): value is string => value !== null && value.trim() !== '')
    .join(' · ');
  return [
    '<header>',
    `<div class="clinic-name">${escapeHtmlText(identity.clinicName)}</div>`,
    contact === '' ? '' : `<div class="meta">${escapeHtmlText(contact)}</div>`,
    '</header>',
  ].join('');
}

function buildAddressee(recap: NonCapitationRecapResponse): string {
  const { settings } = recap;
  if (!settings.isConfigured) {
    return '<div class="notice">FKTP induk belum diatur di panel BPJS. Lengkapi kode dan nama FKTP induk sebelum surat ini dikirim.</div>';
  }
  return `<p>Kepada Yth. Pimpinan ${escapeHtmlText(settings.networkParentProviderName ?? '')} (kode FKTP ${escapeHtmlText(settings.networkParentProviderCode ?? '')})</p>`;
}

/** What Q12's answers change in the letter, each only once it is known. */
function buildArrangementNotes(recap: NonCapitationRecapResponse): string[] {
  const notes: string[] = [];
  if (recap.settings.hasOwnEclaimLogin === true) {
    notes.push(
      'Pelayanan pada rekap ini diinput oleh bidan jejaring di aplikasi eClaim dengan kode FKTP induk.',
    );
  } else {
    notes.push(
      'Mohon pelayanan pada rekap ini diinput oleh FKTP induk di aplikasi eClaim BPJS Kesehatan.',
    );
  }
  if (recap.settings.isNetworkParentGovernmentOwned === true) {
    notes.push(
      'FKTP induk milik Pemerintah Daerah: klaim diajukan melalui FKTP induk dan dibayarkan penuh kepada bidan jejaring (Permenkes 28/2014 lampiran hlm. 39).',
    );
  }
  if (recap.maximumCoachingFeeAmount !== null) {
    notes.push(
      `Biaya pembinaan oleh FKTP induk paling banyak ${String(NON_CAPITATION_MAX_COACHING_FEE_PERCENT)}% dari total klaim, yaitu ${NON_CAPITATION_FORMAT.rupiah(recap.maximumCoachingFeeAmount)} (Permenkes 28/2014 lampiran hlm. 39).`,
    );
  }
  return notes;
}

function buildTable(params: {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly numericColumns: readonly number[];
}): string {
  const numeric = new Set(params.numericColumns);
  const cell = (value: string, index: number, tag: 'td' | 'th'): string =>
    `<${tag}${numeric.has(index) && tag === 'td' ? ' class="num"' : ''}>${escapeHtmlText(value)}</${tag}>`;
  const head = params.columns.map((column, index) => cell(column, index, 'th')).join('');
  const body =
    params.rows.length === 0
      ? `<tr><td colspan="${String(params.columns.length)}">Tidak ada pelayanan yang dapat diklaim bulan ini.</td></tr>`
      : params.rows
          .map((row) => `<tr>${row.map((value, index) => cell(value, index, 'td')).join('')}</tr>`)
          .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildSummary(recap: NonCapitationRecapResponse): string {
  const rows = recap.summary.map((item) => [
    NON_CAPITATION_LABELS.serviceType[item.serviceType],
    String(item.count),
    NON_CAPITATION_FORMAT.rupiah(item.totalAmount),
  ]);
  rows.push(['Total', String(recap.lines.length), NON_CAPITATION_FORMAT.rupiah(recap.totalAmount)]);
  return buildTable({
    columns: ['Jenis pelayanan', 'Jumlah', 'Nilai'],
    rows,
    numericColumns: [1, 2],
  });
}

/**
 * The letter to the induk FKTP that goes with the month's recap (P25-T16):
 * the clinic's letterhead, the induk, the month and its filing date, the
 * totals per service type, the arrangements Q12 decides, and the recap lines
 * with their document checklist. The FPK, kuitansi and SPTJM are the induk's
 * own (Peraturan BPJS 7/2018 Pasal 12) and are not generated. Self-contained
 * HTML: the renderer has no network.
 */
export function buildNonCapitationLetterHtml(
  recap: NonCapitationRecapResponse,
  identity: ClinicReportingIdentity,
): string {
  return [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">',
    `<title>Rekap klaim non-kapitasi ${escapeHtmlText(recap.monthLabel)}</title><style>${DOCUMENT_CSS}</style></head><body>`,
    buildLetterhead(identity),
    buildAddressee(recap),
    `<h1>Rekapitulasi klaim non-kapitasi bidan jejaring — ${escapeHtmlText(recap.monthLabel)}</h1>`,
    `<p>Dengan hormat, bersama ini kami sampaikan rekap pelayanan non-kapitasi peserta JKN bulan ${escapeHtmlText(recap.monthLabel)} untuk diajukan paling lambat ${escapeHtmlText(NON_CAPITATION_FORMAT.date(recap.filingDeadline))}. Setiap pelayanan kedaluwarsa 6 bulan setelah diberikan (Perpres 82/2018 Pasal 77).</p>`,
    ...buildArrangementNotes(recap).map((note) => `<p>${escapeHtmlText(note)}</p>`),
    recap.unpricedCount > 0
      ? `<div class="notice">${String(recap.unpricedCount)} pelayanan belum memiliki tarif yang berlaku pada tanggalnya dan tidak dihitung dalam total.</div>`
      : '',
    '<h2>Ringkasan</h2>',
    buildSummary(recap),
    '<h2>Rincian pelayanan</h2>',
    buildTable({
      columns: NON_CAPITATION_LINE_COLUMNS,
      rows: recap.lines.map(buildNonCapitationLineCells),
      numericColumns: [0, 7],
    }),
    '<p class="meta">Tarif: Permenkes 3/2023 Pasal 19–22 (batang tubuh), hlm. 13–16. Dokumen pendukung menurut Peraturan BPJS Kesehatan 7/2018 Pasal 13–14. Rekap ini tidak memuat diagnosis, temuan klinis, maupun isi dokumen.</p>',
    `<p class="meta">Dicetak ${escapeHtmlText(recap.generatedAt)}</p>`,
    `<div class="signature">Hormat kami,<div class="line">${escapeHtmlText(identity.clinicName)}</div></div>`,
    '</body></html>',
  ].join('');
}
