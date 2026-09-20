import { TaxReportPdfTable } from '@hms/shared-types';

import { escapeHtmlText } from '../../../common/html/escape-html-text';

/**
 * A table of the tax report PDF (P27-T12). Every cell is escaped here, so a
 * section builder hands over plain text — an invoice number is data, never
 * markup. The header row repeats on each page and rows are kept whole.
 */
export function buildTaxReportPdfTable(table: TaxReportPdfTable): string {
  const numeric = new Set(table.numericColumns);
  const buildCells = (cells: string[], tag: 'th' | 'td'): string =>
    cells
      .map(
        (cell, index) =>
          `<${tag}${numeric.has(index) ? ' class="num"' : ''}>${escapeHtmlText(cell)}</${tag}>`,
      )
      .join('');
  const rows = table.rows.map((row) => `<tr>${buildCells(row, 'td')}</tr>`).join('');
  const totalRow = table.totalRow
    ? `<tr class="total">${buildCells(table.totalRow, 'td')}</tr>`
    : '';
  return `<table><thead><tr>${buildCells(table.headers, 'th')}</tr></thead><tbody>${rows}${totalRow}</tbody></table>`;
}
