import { BuildTaxReportPdfHtmlParams } from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';

const UNKNOWN_ACTOR = 'pengguna tidak dikenal';

/**
 * The footer on every page of the tax report PDF (P27-T12): the fixed
 * "not an SPT" line, who drafted and who finalized it, and page x/y.
 *
 * Chromium renders it in its own context: none of the body's CSS applies and
 * the default font size is zero, so every style is inline. The page numbers
 * are Chromium's `pageNumber` / `totalPages` placeholders.
 */
export function buildTaxReportPdfFooterHtml(params: BuildTaxReportPdfHtmlParams): string {
  const { report, actors } = params.context;
  const generated = `Dihitung ${params.format.instant(report.generatedAt)} oleh ${actors.generatedByName ?? UNKNOWN_ACTOR}`;
  const finalized =
    report.finalizedAt === null
      ? 'Belum difinalkan'
      : `Difinalkan ${params.format.instant(report.finalizedAt)} oleh ${actors.finalizedByName ?? UNKNOWN_ACTOR}`;
  return [
    '<html><head><meta charset="utf-8"></head><body style="margin:0">',
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#444;width:100%;padding:0 0.6in;display:flex;justify-content:space-between;gap:12pt">',
    '<div>',
    '<div>Dokumen kerja — bukan SPT. Setor dan laporkan melalui Coretax DJP.</div>',
    `<div>${escapeHtmlText(generated)} · ${escapeHtmlText(finalized)}</div>`,
    '</div>',
    '<div style="white-space:nowrap">Halaman <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    '</div></body></html>',
  ].join('');
}
