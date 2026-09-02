import serializeDom from 'dom-serializer';
import { Element, Text } from 'domhandler';
import * as domutils from 'domutils';
import * as htmlparser2 from 'htmlparser2';

import {
  INVOICE_ITEM_COLUMN_TOKENS,
  InvoiceDocumentWatermark,
  InvoiceItemColumnToken,
  ResolvedInvoiceVariables,
} from '@hms/shared-types';

const TOKEN_ATTRIBUTE = 'data-hms-var';

const ITEMS_BLOCK_TOKEN = 'items';

const IMAGE_TOKENS: ReadonlySet<string> = new Set(['clinic.logo', 'invoice.qrVerify']);

const DATA_IMAGE_SOURCE_PREFIX = 'data:image/';

const ITEM_COLUMN_HEADINGS: Readonly<Record<InvoiceItemColumnToken, string>> = {
  'item.no': 'No',
  'item.description': 'Uraian',
  'item.quantity': 'Jml',
  'item.unitPrice': 'Harga Satuan',
  'item.amount': 'Jumlah',
};

type BuildInvoiceDocumentHtmlParams = {
  readonly contentHtml: string;
  readonly resolved: ResolvedInvoiceVariables;
  readonly watermark: InvoiceDocumentWatermark;
  /**
   * The author's column choice for the `items` block (`P16-T11`,
   * `settings.itemsColumns`). Optional because version rows published before
   * the field existed carry no choice — they render the full built-in set.
   */
  readonly itemColumns?: readonly InvoiceItemColumnToken[];
  /**
   * FR-E1-13: reserve the *materai* placement when the total exceeds the
   * configured threshold. A fixed-size box at the end of the document, kept
   * whole across page breaks — a placement for a physical stamp, nothing more.
   */
  readonly showMateraiArea?: boolean;
};

/**
 * Fills a sanitised template with resolved values and wraps it into the
 * self-contained page the renderer consumes (`P16-T06`).
 *
 * The input grammar is the sanitiser's canonical form: every token is an
 * empty element carrying `data-hms-var`, so substitution is a DOM walk with
 * no string matching against author copy. Three substitution shapes exist:
 *
 *   * scalar tokens become a text node — serialisation escapes them, so a
 *     patient named `<script>` prints as text (US-E1-06's hostile-input rule);
 *   * image tokens become an `<img>` only when the resolved value is an
 *     inline `data:image/*` payload — the renderer is network-denied and this
 *     builder never gives it a reason to fetch;
 *   * the `items` block becomes the line-item table, one row per invoice
 *     line, with the header row group repeating across page breaks.
 *
 * The wrapper owns what a layout must not get wrong on hostile data: value
 * wrapping (`overflow-wrap`), table pagination (`thead` as
 * `table-header-group`, rows kept whole), and the VOID watermark — a fixed
 * element Chromium paints on every page — with the reason and voiding user in
 * the footer (FR-E1-11).
 */
export function buildInvoiceDocumentHtml(params: BuildInvoiceDocumentHtmlParams): string {
  const itemColumns = resolveItemColumns(params.itemColumns);
  const filledHtml = fillTemplateTokens(params.contentHtml, params.resolved, itemColumns);
  return wrapDocument(filledHtml, params.watermark, params.showMateraiArea ?? false);
}

function resolveItemColumns(
  itemColumns: readonly InvoiceItemColumnToken[] | undefined,
): readonly InvoiceItemColumnToken[] {
  if (itemColumns === undefined || itemColumns.length === 0) {
    return INVOICE_ITEM_COLUMN_TOKENS;
  }
  return itemColumns;
}

function fillTemplateTokens(
  contentHtml: string,
  resolved: ResolvedInvoiceVariables,
  itemColumns: readonly InvoiceItemColumnToken[],
): string {
  const dom = htmlparser2.parseDocument(contentHtml);
  const tokenElements = domutils.findAll(
    (node): node is Element => node instanceof Element && node.attribs[TOKEN_ATTRIBUTE] !== undefined,
    [dom],
  );
  for (const element of tokenElements) {
    const token = element.attribs[TOKEN_ATTRIBUTE] ?? '';
    if (token === ITEMS_BLOCK_TOKEN) {
      fillItemsBlock(element, resolved, itemColumns);
      continue;
    }
    if (IMAGE_TOKENS.has(token)) {
      fillImageToken(element, resolved.values[token] ?? '');
      continue;
    }
    setElementText(element, resolved.values[token] ?? '');
  }
  return serializeDom(dom.children);
}

function fillItemsBlock(
  element: Element,
  resolved: ResolvedInvoiceVariables,
  itemColumns: readonly InvoiceItemColumnToken[],
): void {
  clearChildren(element);
  if (resolved.items.length === 0) {
    return;
  }
  const table = new Element('table', { class: 'hms-items' });
  const head = new Element('thead', {});
  const headRow = new Element('tr', {});
  for (const column of itemColumns) {
    const cell = new Element('th', {});
    setElementText(cell, ITEM_COLUMN_HEADINGS[column]);
    domutils.appendChild(headRow, cell);
  }
  domutils.appendChild(head, headRow);
  domutils.appendChild(table, head);
  const body = new Element('tbody', {});
  for (const item of resolved.items) {
    const row = new Element('tr', {});
    for (const column of itemColumns) {
      const cell = new Element('td', { class: buildItemCellClass(column) });
      setElementText(cell, item[column] ?? '');
      domutils.appendChild(row, cell);
    }
    domutils.appendChild(body, row);
  }
  domutils.appendChild(table, body);
  domutils.appendChild(element, table);
}

function buildItemCellClass(token: string): string {
  const isNumericColumn = token !== 'item.description';
  return isNumericColumn ? 'hms-cell-numeric' : 'hms-cell-text';
}

function fillImageToken(element: Element, value: string): void {
  clearChildren(element);
  if (!value.startsWith(DATA_IMAGE_SOURCE_PREFIX)) {
    return;
  }
  const image = new Element('img', { src: value, class: 'hms-inline-image', alt: '' });
  domutils.appendChild(element, image);
}

function setElementText(element: Element, value: string): void {
  clearChildren(element);
  if (value === '') {
    return;
  }
  domutils.appendChild(element, new Text(value));
}

function clearChildren(element: Element): void {
  for (const child of [...element.children]) {
    domutils.removeElement(child);
  }
}

function wrapDocument(
  filledHtml: string,
  watermark: InvoiceDocumentWatermark,
  showMateraiArea: boolean,
): string {
  const watermarkMarkup = watermark.isVoid ? buildWatermarkMarkup(watermark) : '';
  return [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><style>',
    BASE_DOCUMENT_CSS,
    '</style></head><body>',
    watermarkMarkup,
    '<main class="hms-document">',
    filledHtml,
    showMateraiArea ? MATERAI_AREA_MARKUP : '',
    '</main>',
    watermark.isVoid ? buildVoidFooterMarkup(watermark) : '',
    '</body></html>',
  ].join('');
}

const MATERAI_AREA_MARKUP =
  '<section class="hms-materai" aria-label="Materai"><div class="hms-materai-box">Materai</div><div class="hms-materai-caption">Tempel materai di sini</div></section>';

function buildWatermarkMarkup(watermark: InvoiceDocumentWatermark): string {
  void watermark;
  return '<div class="hms-void-watermark" aria-hidden="true">BATAL / VOID</div>';
}

function buildVoidFooterMarkup(watermark: InvoiceDocumentWatermark): string {
  const reason = escapeHtmlText(watermark.reason ?? '');
  const voidedBy = escapeHtmlText(watermark.voidedByName ?? '');
  const detail = [reason, voidedBy].filter((part) => part !== '').join(' — ');
  return `<footer class="hms-void-footer">DIBATALKAN / VOID${detail === '' ? '' : `: ${detail}`}</footer>`;
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const BASE_DOCUMENT_CSS = [
  '* { box-sizing: border-box; }',
  'body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }',
  // Hostile-input rule: a 120-character name wraps inside its cell instead of
  // overlapping a neighbour (US-E1-06).
  '.hms-document { overflow-wrap: anywhere; }',
  '.hms-document td, .hms-document th { overflow-wrap: anywhere; vertical-align: top; }',
  '.hms-items { width: 100%; border-collapse: collapse; font-size: 10pt; }',
  '.hms-items th, .hms-items td { border: 1px solid #444; padding: 1.5mm 2mm; }',
  '.hms-items th { background-color: #eee; text-align: left; }',
  '.hms-cell-numeric { text-align: right; white-space: nowrap; }',
  // Pagination: the header row group repeats on every page and a row is never
  // split across two.
  '.hms-items thead { display: table-header-group; }',
  '.hms-items tr { page-break-inside: avoid; }',
  '.hms-inline-image { max-width: 40mm; max-height: 20mm; }',
  // FR-E1-13: a stamp-sized placement, never split across pages.
  '.hms-materai { margin-top: 8mm; display: flex; flex-direction: column; align-items: flex-end; page-break-inside: avoid; }',
  '.hms-materai-box { width: 30mm; height: 22mm; border: 1px dashed #666; display: flex; align-items: center; justify-content: center; font-size: 9pt; color: #666; }',
  '.hms-materai-caption { font-size: 8pt; color: #666; margin-top: 1mm; }',
  // `position: fixed` paints on every page in paged media — one declaration
  // covers a document of any length (FR-E1-11).
  '.hms-void-watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center;',
  '  transform: rotate(-30deg); font-size: 64pt; font-weight: bold; color: #b91c1c; opacity: 0.25; z-index: 10; }',
  '.hms-void-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center;',
  '  font-size: 9pt; font-weight: bold; color: #b91c1c; border-top: 1px solid #b91c1c; padding: 1mm 0; }',
].join('\n');
