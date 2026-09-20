import { TaxReportPdfSummaryRow } from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';

/** A label/value block of the tax report PDF (P27-T12); values are escaped here. */
export function buildTaxReportPdfSummary(rows: readonly TaxReportPdfSummaryRow[]): string {
  const items = rows
    .map(
      (row) =>
        `<tr${row.isEmphasised ? ' class="emphasis"' : ''}><th>${escapeHtmlText(row.label)}</th><td class="num">${escapeHtmlText(row.value)}</td></tr>`,
    )
    .join('');
  return `<table class="summary"><tbody>${items}</tbody></table>`;
}
