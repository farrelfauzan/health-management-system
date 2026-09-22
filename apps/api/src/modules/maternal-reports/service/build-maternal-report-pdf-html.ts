import { MaternalReportHeader } from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';

const MISSING_VALUE = '-';

const DOCUMENT_CSS = [
  '* { box-sizing: border-box; }',
  'body { font-family: Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #111; margin: 0; overflow-wrap: anywhere; }',
  'header { border-bottom: 1.5pt solid #111; padding-bottom: 6pt; margin-bottom: 8pt; display: flex; justify-content: space-between; gap: 12pt; }',
  '.clinic-name { font-size: 12pt; font-weight: bold; }',
  '.meta { font-size: 8pt; color: #333; }',
  'h1 { font-size: 12pt; margin: 0 0 2pt; }',
  'h2 { font-size: 9.5pt; margin: 10pt 0 4pt; }',
  '.notice { border: 1pt solid #b45309; background: #fffbeb; padding: 4pt 6pt; font-size: 7.5pt; margin: 6pt 0; }',
  'table { width: 100%; border-collapse: collapse; }',
  'thead { display: table-header-group; }',
  'tr { page-break-inside: avoid; }',
  'th, td { text-align: left; vertical-align: top; padding: 2pt 3pt; border: 0.5pt solid #999; font-size: 6.5pt; }',
  'thead th { background: #f1f5f9; }',
  'td.num, th.num { text-align: right; white-space: nowrap; }',
  '.summary td { font-size: 8pt; }',
  '.definition { color: #555; font-size: 6pt; }',
].join('\n');

export type MaternalReportPdfSection = {
  readonly heading: string | null;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Zero-based columns to right-align (counts). */
  readonly numericColumns?: readonly number[];
};

export type BuildMaternalReportPdfHtmlParams = {
  readonly title: string;
  readonly header: MaternalReportHeader;
  readonly notices: readonly string[];
  readonly sections: readonly MaternalReportPdfSection[];
};

function buildHeader(params: BuildMaternalReportPdfHtmlParams): string {
  const { header } = params;
  const puskesmas = [header.puskesmasName, header.puskesmasCode]
    .filter((value): value is string => value !== null && value.trim() !== '')
    .join(' · ');
  return [
    '<header>',
    `<div><div class="clinic-name">${escapeHtmlText(header.clinicName)}</div>`,
    `<div class="meta">Puskesmas pelapor: ${escapeHtmlText(puskesmas === '' ? MISSING_VALUE : puskesmas)}</div></div>`,
    `<div><h1>${escapeHtmlText(params.title)}</h1>`,
    `<div class="meta">Bulan ${escapeHtmlText(header.monthLabel)} · Dicetak ${escapeHtmlText(header.generatedAt)}</div></div>`,
    '</header>',
  ].join('');
}

function buildSection(section: MaternalReportPdfSection): string {
  const numeric = new Set(section.numericColumns ?? []);
  const head = section.columns
    .map(
      (column, index) =>
        `<th${numeric.has(index) ? ' class="num"' : ''}>${escapeHtmlText(column)}</th>`,
    )
    .join('');
  const body =
    section.rows.length === 0
      ? `<tr><td colspan="${section.columns.length}">Tidak ada data.</td></tr>`
      : section.rows
          .map(
            (row) =>
              `<tr>${row
                .map(
                  (cell, index) =>
                    `<td${numeric.has(index) ? ' class="num"' : ''}>${escapeHtmlText(cell)}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('');
  return [
    section.heading === null ? '' : `<h2>${escapeHtmlText(section.heading)}</h2>`,
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
  ].join('');
}

/**
 * A landscape register or report as self-contained HTML for the PDF renderer
 * (P25-T15): the clinic and puskesmas header, the provisional-layout notice,
 * then one table per section. Nothing is referenced from outside the
 * document because the renderer has no network.
 */
export function buildMaternalReportPdfHtml(params: BuildMaternalReportPdfHtmlParams): string {
  return [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">',
    `<title>${escapeHtmlText(params.title)}</title><style>${DOCUMENT_CSS}</style></head><body>`,
    buildHeader(params),
    ...params.notices.map((notice) => `<div class="notice">${escapeHtmlText(notice)}</div>`),
    ...params.sections.map(buildSection),
    '</body></html>',
  ].join('');
}
