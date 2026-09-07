import { ClinicalRequestLine } from '@hms/shared-types';
import serializeDom from 'dom-serializer';
import { Element, Text } from 'domhandler';
import * as domutils from 'domutils';
import * as htmlparser2 from 'htmlparser2';

const TOKEN_ATTRIBUTE = 'data-hms-var';

/**
 * The repeating blocks, and the columns each renders. Fixed rather than
 * author-chosen: an invoice lets the clinic pick its columns because a receipt
 * is a commercial document, but a surat pengantar has to show the test and a
 * resep has to show the dose — dropping either makes the paper useless, so it
 * is not a choice worth offering.
 */
const BLOCK_COLUMNS: Readonly<Record<string, readonly { token: string; heading: string }[]>> = {
  tests: [
    { token: 'test.no', heading: 'No' },
    { token: 'test.code', heading: 'Kode' },
    { token: 'test.name', heading: 'Pemeriksaan' },
    { token: 'test.panel', heading: 'Paket' },
    { token: 'test.specimen', heading: 'Spesimen' },
  ],
  medications: [
    { token: 'medication.no', heading: 'No' },
    { token: 'medication.name', heading: 'Obat' },
    { token: 'medication.dosage', heading: 'Dosis' },
    { token: 'medication.frequency', heading: 'Aturan pakai' },
    { token: 'medication.quantity', heading: 'Jml' },
    { token: 'medication.instructions', heading: 'Petunjuk' },
  ],
};

const IMAGE_TOKENS: ReadonlySet<string> = new Set(['clinic.logo', 'order.barcode']);

const DATA_IMAGE_SOURCE_PREFIX = 'data:image/';

/** Columns that read as quantities line up right; everything else reads as prose. */
const NUMERIC_COLUMN_TOKENS: ReadonlySet<string> = new Set([
  'test.no',
  'medication.no',
  'medication.quantity',
]);

type BuildClinicalRequestHtmlParams = {
  readonly contentHtml: string;
  readonly values: Readonly<Record<string, string>>;
  readonly lines: readonly ClinicalRequestLine[];
};

/**
 * Fills a sanitised clinical-request template with resolved values and wraps it
 * into the self-contained page the renderer consumes (`P18-T12`).
 *
 * The same grammar and the same DOM-walk substitution the invoice builder uses:
 * every token is an empty element carrying `data-hms-var`, so filling is a walk
 * rather than string interpolation, and a value can never be parsed as markup.
 * It is a separate function rather than a parameterised invoice builder because
 * the two share only the grammar — this one has no watermark, no materai and no
 * author-chosen columns, and folding them together would mean a function whose
 * every branch is "which document is this".
 */
export function buildClinicalRequestHtml(params: BuildClinicalRequestHtmlParams): string {
  const filled = fillTemplateTokens(params.contentHtml, params.values, params.lines);
  return wrapDocument(filled);
}

function fillTemplateTokens(
  contentHtml: string,
  values: Readonly<Record<string, string>>,
  lines: readonly ClinicalRequestLine[],
): string {
  const dom = htmlparser2.parseDocument(contentHtml);
  const tokenElements = domutils.findAll(
    (node): node is Element =>
      node instanceof Element && node.attribs[TOKEN_ATTRIBUTE] !== undefined,
    [dom],
  );
  for (const element of tokenElements) {
    const token = element.attribs[TOKEN_ATTRIBUTE] ?? '';
    const columns = BLOCK_COLUMNS[token];
    if (columns) {
      fillLinesBlock(element, lines, columns);
      continue;
    }
    if (IMAGE_TOKENS.has(token)) {
      fillImageToken(element, values[token] ?? '');
      continue;
    }
    setElementText(element, values[token] ?? '');
  }
  return serializeDom(dom.children);
}

function fillLinesBlock(
  element: Element,
  lines: readonly ClinicalRequestLine[],
  columns: readonly { token: string; heading: string }[],
): void {
  clearChildren(element);
  if (lines.length === 0) {
    return;
  }
  const table = new Element('table', { class: 'hms-items' });
  const head = new Element('thead', {});
  const headRow = new Element('tr', {});
  for (const column of columns) {
    const cell = new Element('th', {});
    setElementText(cell, column.heading);
    domutils.appendChild(headRow, cell);
  }
  domutils.appendChild(head, headRow);
  domutils.appendChild(table, head);
  const body = new Element('tbody', {});
  for (const line of lines) {
    const row = new Element('tr', {});
    for (const column of columns) {
      const cell = new Element('td', {
        class: NUMERIC_COLUMN_TOKENS.has(column.token) ? 'hms-cell-numeric' : 'hms-cell-text',
      });
      setElementText(cell, line[column.token] ?? '');
      domutils.appendChild(row, cell);
    }
    domutils.appendChild(body, row);
  }
  domutils.appendChild(table, body);
  domutils.appendChild(element, table);
}

/**
 * Only a `data:` image is ever placed. A remote source in a rendered document
 * is a request the renderer would make on the clinic's behalf, and a template
 * is not entitled to make one.
 */
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

function wrapDocument(filledHtml: string): string {
  return [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><style>',
    BASE_DOCUMENT_CSS,
    '</style></head><body><main class="hms-document">',
    filledHtml,
    '</main></body></html>',
  ].join('');
}

const BASE_DOCUMENT_CSS = [
  '* { box-sizing: border-box; }',
  'body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }',
  // The hostile-input rule the invoice layout already carries: a 120-character
  // medication name wraps inside its cell instead of overlapping a neighbour.
  '.hms-document { overflow-wrap: anywhere; }',
  '.hms-document td, .hms-document th { overflow-wrap: anywhere; vertical-align: top; }',
  '.hms-document table:not(.hms-items) { width: 100% !important; table-layout: fixed; border-collapse: collapse; }',
  '.hms-document table:not(.hms-items) td, .hms-document table:not(.hms-items) th { padding: 0.5mm 1.5mm; }',
  '.hms-document p { margin: 0 0 1mm 0; }',
  '.hms-document h2 { font-size: 13pt; margin: 0 0 1mm 0; }',
  '.hms-document h3 { font-size: 11pt; margin: 0 0 1mm 0; }',
  '.hms-document hr { border: 0; border-top: 1px solid #444; margin: 2mm 0; }',
  '.hms-items { width: 100%; border-collapse: collapse; font-size: 10pt; }',
  '.hms-items th, .hms-items td { border: 1px solid #444; padding: 1.5mm 2mm; }',
  '.hms-items th { background-color: #eee; text-align: left; }',
  '.hms-cell-numeric { text-align: right; white-space: nowrap; }',
  '.hms-items thead { display: table-header-group; }',
  '.hms-items tr { page-break-inside: avoid; }',
  '.hms-inline-image { max-width: 45mm; max-height: 20mm; }',
].join('\n');
