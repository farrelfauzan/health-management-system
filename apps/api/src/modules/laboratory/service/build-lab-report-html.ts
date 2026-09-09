import serializeDom from 'dom-serializer';
import { Element, Text } from 'domhandler';
import * as domutils from 'domutils';
import * as htmlparser2 from 'htmlparser2';

const TOKEN_ATTRIBUTE = 'data-hms-var';

const RESULTS_BLOCK_TOKEN = 'results';

/**
 * The columns the results block renders, in order. Fixed rather than
 * author-chosen, as the request blocks are: a report without the value or the
 * band it was judged against is not a report, so it is not a choice worth
 * offering in an editor.
 */
const RESULT_COLUMNS: readonly { token: string; heading: string }[] = [
  { token: 'result.no', heading: 'No' },
  { token: 'result.test', heading: 'Pemeriksaan' },
  { token: 'result.value', heading: 'Hasil' },
  { token: 'result.unit', heading: 'Satuan' },
  { token: 'result.flag', heading: '' },
  { token: 'result.referenceRange', heading: 'Nilai rujukan' },
];

const FLAG_COLUMN_TOKEN = 'result.flag';

const NUMERIC_COLUMN_TOKENS: ReadonlySet<string> = new Set(['result.no', 'result.value']);

const IMAGE_TOKENS: ReadonlySet<string> = new Set(['clinic.logo']);

/**
 * Blocks that exist only to frame one token — a heading over the verifier's
 * note — and must leave the page with it when the token is empty (P18-T14).
 * Keyed by the class the built-in layout gives the wrapper; a clinic template
 * that keeps the class keeps the behaviour, one that drops it prints the
 * empty span the way any other token prints.
 */
const OMIT_WHEN_EMPTY_WRAPPERS: ReadonlyMap<string, string> = new Map([
  ['report.note', 'hms-report-note'],
]);

const DATA_IMAGE_SOURCE_PREFIX = 'data:image/';

type BuildLabReportHtmlParams = {
  readonly contentHtml: string;
  readonly values: Readonly<Record<string, string>>;
  readonly lines: readonly Readonly<Record<string, string>>[];
};

/**
 * Fills a sanitised `LAB_REPORT` template with the released values and wraps
 * it into the self-contained page the renderer consumes (P18-T05).
 *
 * The same grammar and the same DOM-walk substitution the invoice and the
 * printed requests use — every token is an empty element carrying
 * `data-hms-var`, so a patient's name reaches the page as text and never as
 * markup. A third builder rather than a parameter on the second, for the
 * reason the second was not a parameter on the first: they share only the
 * grammar. This one has one block, a flag column that marks its row, and a
 * notice that must be visible when it is filled and take no space when it is
 * not — none of which a request has.
 */
export function buildLabReportHtml(params: BuildLabReportHtmlParams): string {
  const filled = fillTemplateTokens(params.contentHtml, params.values, params.lines);
  return wrapDocument(filled);
}

function fillTemplateTokens(
  contentHtml: string,
  values: Readonly<Record<string, string>>,
  lines: readonly Readonly<Record<string, string>>[],
): string {
  const dom = htmlparser2.parseDocument(contentHtml);
  const tokenElements = domutils.findAll(
    (node): node is Element =>
      node instanceof Element && node.attribs[TOKEN_ATTRIBUTE] !== undefined,
    [dom],
  );
  for (const element of tokenElements) {
    const token = element.attribs[TOKEN_ATTRIBUTE] ?? '';
    if (token === RESULTS_BLOCK_TOKEN) {
      fillResultsBlock(element, lines);
      continue;
    }
    if (IMAGE_TOKENS.has(token)) {
      fillImageToken(element, values[token] ?? '');
      continue;
    }
    const value = values[token] ?? '';
    if (value === '' && removeEmptyWrapper(element, OMIT_WHEN_EMPTY_WRAPPERS.get(token))) {
      continue;
    }
    setElementText(element, value);
  }
  // UTF-8 entities: the page declares its charset, and the flag markers and
  // the em dash in the banner are read back by the specs — and by a person
  // debugging a render — as the characters they are, not as `&#x25bc;`.
  return serializeDom(dom.children, { encodeEntities: 'utf8' });
}

function fillResultsBlock(
  element: Element,
  lines: readonly Readonly<Record<string, string>>[],
): void {
  clearChildren(element);
  if (lines.length === 0) {
    return;
  }
  const table = new Element('table', { class: 'hms-items' });
  const head = new Element('thead', {});
  const headRow = new Element('tr', {});
  for (const column of RESULT_COLUMNS) {
    const cell = new Element('th', {});
    setElementText(cell, column.heading);
    domutils.appendChild(headRow, cell);
  }
  domutils.appendChild(head, headRow);
  domutils.appendChild(table, head);
  const body = new Element('tbody', {});
  for (const line of lines) {
    domutils.appendChild(body, buildResultRow(line));
  }
  domutils.appendChild(table, body);
  domutils.appendChild(element, table);
}

/**
 * A flagged value marks its whole row, not only its marker cell: the reader
 * scanning a page of thirty numbers finds the abnormal one by the row, and a
 * photocopy keeps a bold row where it loses a colour.
 */
function buildResultRow(line: Readonly<Record<string, string>>): Element {
  const isFlagged = (line[FLAG_COLUMN_TOKEN] ?? '') !== '';
  const row = new Element('tr', isFlagged ? { class: 'hms-row-flagged' } : {});
  for (const column of RESULT_COLUMNS) {
    const cell = new Element('td', {
      class: NUMERIC_COLUMN_TOKENS.has(column.token) ? 'hms-cell-numeric' : 'hms-cell-text',
    });
    setElementText(cell, line[column.token] ?? '');
    domutils.appendChild(row, cell);
  }
  return row;
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

/**
 * Removes the nearest ancestor carrying `wrapperClass`, so an empty token
 * takes its heading with it. False when there is no such ancestor, and the
 * caller falls back to an empty span.
 */
function removeEmptyWrapper(element: Element, wrapperClass: string | undefined): boolean {
  if (wrapperClass === undefined) {
    return false;
  }
  let current: Element | null = element;
  while (current !== null) {
    if (hasClass(current, wrapperClass)) {
      domutils.removeElement(current);
      return true;
    }
    current = current.parent instanceof Element ? current.parent : null;
  }
  return false;
}

function hasClass(element: Element, className: string): boolean {
  return (element.attribs['class'] ?? '').split(/\s+/).includes(className);
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
  '.hms-document { overflow-wrap: anywhere; }',
  '.hms-document td, .hms-document th { overflow-wrap: anywhere; vertical-align: top; }',
  '.hms-document table:not(.hms-items) { width: 100% !important; table-layout: fixed; border-collapse: collapse; }',
  '.hms-document table:not(.hms-items) td, .hms-document table:not(.hms-items) th { padding: 0.5mm 1.5mm; }',
  '.hms-document p { margin: 0 0 1mm 0; }',
  '.hms-document h2 { font-size: 13pt; margin: 0 0 1mm 0; }',
  '.hms-document h3 { font-size: 11pt; margin: 0 0 1mm 0; }',
  '.hms-document hr { border: 0; border-top: 1px solid #444; margin: 2mm 0; }',
  // The notice is a box when it says something and nothing when it does not.
  // `:empty` on the span rather than a flag on the paragraph, so a template
  // author who moves the token keeps the behaviour.
  '.hms-amendment-notice { border: 2px solid #111; padding: 2mm; }',
  '.hms-amendment-notice:has(> span:empty) { display: none; }',
  '.hms-items { width: 100%; border-collapse: collapse; font-size: 10pt; }',
  '.hms-items th, .hms-items td { border: 1px solid #444; padding: 1.5mm 2mm; }',
  '.hms-items th { background-color: #eee; text-align: left; }',
  '.hms-cell-numeric { text-align: right; white-space: nowrap; }',
  '.hms-row-flagged td { font-weight: bold; }',
  // The header repeats and a row never splits: a 40-test panel runs past one
  // page, and the second page has to read on its own.
  '.hms-items thead { display: table-header-group; }',
  '.hms-items tr { page-break-inside: avoid; }',
  '.hms-inline-image { max-width: 45mm; max-height: 20mm; }',
].join('\n');
