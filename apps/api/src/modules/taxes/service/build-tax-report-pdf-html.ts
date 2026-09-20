import { BuildTaxReportPdfHtmlParams, ClinicLetterhead } from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';
import { TAX_REPORT_PDF_LAYOUTS } from './tax-report-pdf-layouts';

const DATA_IMAGE_PREFIX = 'data:image/';
const MISSING_VALUE = '—';

const DOCUMENT_CSS = [
  '* { box-sizing: border-box; }',
  'body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; overflow-wrap: anywhere; }',
  'header.letterhead { display: flex; gap: 12pt; align-items: flex-start; border-bottom: 1.5pt solid #111; padding-bottom: 8pt; }',
  'header.letterhead img { max-height: 56pt; max-width: 120pt; object-fit: contain; }',
  '.clinic-name { font-size: 13pt; font-weight: bold; }',
  '.clinic-line { font-size: 9pt; color: #333; }',
  'h1 { font-size: 14pt; margin: 14pt 0 2pt; }',
  '.status { display: inline-block; font-size: 8pt; font-weight: bold; border: 1pt solid #111; border-radius: 3pt; padding: 1pt 5pt; margin-left: 6pt; vertical-align: middle; }',
  'h2 { font-size: 11pt; margin: 14pt 0 6pt; }',
  'h3 { font-size: 10pt; margin: 12pt 0 4pt; }',
  '.notice { border: 1pt solid #b45309; background: #fffbeb; padding: 6pt 8pt; font-size: 9pt; margin-top: 8pt; }',
  '.muted { color: #555; font-size: 9pt; }',
  'table { width: 100%; border-collapse: collapse; }',
  'thead { display: table-header-group; }',
  'tr { page-break-inside: avoid; }',
  'th, td { text-align: left; vertical-align: top; padding: 3pt 5pt; border-bottom: 0.5pt solid #ccc; font-size: 9pt; }',
  'thead th { background: #f1f5f9; border-bottom: 1pt solid #111; }',
  '.num { text-align: right; white-space: nowrap; }',
  'tr.total td { font-weight: bold; border-top: 1pt solid #111; }',
  'table.summary { width: 70%; }',
  'table.summary th { font-weight: normal; }',
  'table.summary tr.emphasis th, table.summary tr.emphasis td { font-weight: bold; font-size: 10.5pt; }',
  '.watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; transform: rotate(-35deg); color: rgba(185, 28, 28, 0.14); pointer-events: none; }',
  '.watermark-word { font-size: 110pt; font-weight: bold; letter-spacing: 8pt; }',
  '.watermark-time { font-size: 14pt; font-weight: bold; }',
].join('\n');

/**
 * The tax report PDF (P27-T12): letterhead, title, the kind's own sections,
 * and — until the report is finalized — a diagonal DRAFT watermark with the
 * time this copy was printed. Self-contained: the logo is already a `data:`
 * URI and nothing else is referenced, because the renderer has no network.
 * Page numbers and the generated/finalized lines are in the footer, which
 * Chromium renders separately.
 */
export function buildTaxReportPdfHtml(params: BuildTaxReportPdfHtmlParams): string {
  const { report, letterhead, nitku } = params.context;
  const layout = TAX_REPORT_PDF_LAYOUTS[report.kind];
  const isDraft = report.status === 'DRAFT';
  const title = `${layout.title} — ${params.format.period(report.period)}`;
  return [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">',
    `<title>${escapeHtmlText(title)}</title><style>${DOCUMENT_CSS}</style></head><body>`,
    isDraft ? buildWatermark(params.format.instant(params.context.renderedAt)) : '',
    buildLetterhead(letterhead, nitku),
    `<h1>${escapeHtmlText(title)}<span class="status">${isDraft ? 'DRAFT' : 'FINAL'}</span></h1>`,
    `<div class="muted">Masa pajak ${escapeHtmlText(report.period)}</div>`,
    '<div class="notice">Dokumen kerja — bukan SPT. Setor dan laporkan melalui Coretax DJP.</div>',
    layout.buildSections({ report, format: params.format }),
    '</body></html>',
  ].join('');
}

function buildLetterhead(letterhead: ClinicLetterhead, nitku: string | null): string {
  const logo =
    letterhead.logoDataUri !== null && letterhead.logoDataUri.startsWith(DATA_IMAGE_PREFIX)
      ? `<img src="${escapeHtmlText(letterhead.logoDataUri)}" alt="">`
      : '';
  const lines = [
    letterhead.legalName,
    letterhead.address,
    `NPWP: ${letterhead.taxId ?? MISSING_VALUE} · NITKU: ${nitku ?? MISSING_VALUE}`,
  ]
    .filter((line): line is string => line !== null && line.trim() !== '')
    .map((line) => `<div class="clinic-line">${escapeHtmlText(line)}</div>`)
    .join('');
  return `<header class="letterhead">${logo}<div><div class="clinic-name">${escapeHtmlText(letterhead.name)}</div>${lines}</div></header>`;
}

function buildWatermark(printedAt: string): string {
  return `<div class="watermark" aria-hidden="true"><div class="watermark-word">DRAFT</div><div class="watermark-time">Dicetak ${escapeHtmlText(printedAt)}</div></div>`;
}
