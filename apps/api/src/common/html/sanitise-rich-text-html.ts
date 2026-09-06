import serializeDom from 'dom-serializer';
import { Element } from 'domhandler';
import * as domutils from 'domutils';
import * as htmlparser2 from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';

/**
 * Server-side rich-text HTML sanitiser (`P16-T05`, NFR-SEC-01).
 *
 * This function is the control; whatever the editor does client-side is a
 * convenience. Every write of `contentHtml` — a template's create, update and
 * publish, and since `P16-T28` a managed document's draft — goes through
 * here, and the output is the only HTML that ever reaches the PDF renderer.
 * It lives in `common` rather than in one module because two modules write
 * editor HTML and neither may import the other's service to do it.
 *
 * The posture is allowlist-everything: elements, attributes, CSS properties,
 * and URL schemes are each enumerated, and anything outside the list is
 * dropped rather than escaped. Two properties are deliberate:
 *
 *   * **No CSS value may contain parentheses.** That single rule removes
 *     `url(…)` (remote fetches from a renderer that must fetch nothing),
 *     `expression(…)`, and every function-shaped obfuscation, at the price of
 *     `rgb()`/`calc()` — hex colours and fixed sizes cover what an invoice
 *     layout needs.
 *   * **`<img>` may only carry a `data:image/*` source.** The renderer is
 *     network-denied (D-026), so a remote reference would render blank anyway;
 *     stripping it here means the template never stores one.
 *
 * Variable tokens survive as `<span data-hms-var="…"></span>` (or `div` for
 * block tokens): after sanitisation every token element is canonicalised to
 * exactly that shape — token attribute kept, every other attribute and all
 * child content dropped. The stored document holds the machine token, never
 * the palette label (FR-E1-03), which is also what lets the render service
 * substitute values with a deterministic match.
 *
 * The function is idempotent: sanitised output passes through unchanged.
 */
const TOKEN_ATTRIBUTE = 'data-hms-var';

const TOKEN_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)?$/;

const DATA_IMAGE_SOURCE_PREFIX = 'data:image/';

const ALLOWED_TAGS: readonly string[] = [
  'p',
  'div',
  'span',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'sub',
  'sup',
  'small',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
  'img',
];

/**
 * Values may not contain parentheses, semicolons, braces, or backslashes —
 * see the docstring. Quotes stay allowed for font family names.
 */
const SAFE_STYLE_VALUE = /^[a-zA-Z0-9 #%.,'"!-]+$/;

const ALLOWED_STYLE_PROPERTIES: readonly string[] = [
  'color',
  'background-color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'vertical-align',
  'white-space',
  'word-break',
  'overflow-wrap',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-color',
  'border-collapse',
  'border-spacing',
  'border-radius',
  'width',
  'height',
  'max-width',
  'min-width',
  'max-height',
  'min-height',
  'display',
  'page-break-before',
  'page-break-after',
  'page-break-inside',
  'break-inside',
];

const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  '*': Object.fromEntries(
    ALLOWED_STYLE_PROPERTIES.map((property) => [property, [SAFE_STYLE_VALUE]]),
  ),
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    '*': ['style', 'class', TOKEN_ATTRIBUTE],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    col: ['span', 'width'],
    table: ['width', 'cellpadding', 'cellspacing'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedStyles: ALLOWED_STYLES,
  // Only `img.src` carries a URL in this allowlist, and only inline images
  // are meaningful to a renderer that cannot fetch. `javascript:` and every
  // remote scheme fall out of the allowlist rather than being blocklisted.
  allowedSchemes: [],
  allowedSchemesByTag: { img: ['data'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

export function sanitiseRichTextHtml(rawHtml: string): string {
  const allowlisted = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
  return canonicaliseTemplateDom(allowlisted);
}

/**
 * Second pass over the allowlisted HTML: token elements are reduced to their
 * canonical empty form, and `img` sources that are not inline `data:image/*`
 * payloads are dropped (a relative path would survive scheme filtering, and a
 * `data:text/html` payload is a document, not a picture).
 */
function canonicaliseTemplateDom(allowlistedHtml: string): string {
  const dom = htmlparser2.parseDocument(allowlistedHtml);
  const elements = domutils.findAll((node): node is Element => node instanceof Element, [dom]);
  for (const element of elements) {
    canonicaliseTokenElement(element);
    dropNonInlineImageSource(element);
  }
  return serializeDom(dom.children);
}

function canonicaliseTokenElement(element: Element): void {
  const token = element.attribs[TOKEN_ATTRIBUTE];
  if (token === undefined) {
    return;
  }
  if (!TOKEN_PATTERN.test(token)) {
    delete element.attribs[TOKEN_ATTRIBUTE];
    return;
  }
  element.attribs = { [TOKEN_ATTRIBUTE]: token };
  for (const child of [...element.children]) {
    domutils.removeElement(child);
  }
}

function dropNonInlineImageSource(element: Element): void {
  if (element.name !== 'img') {
    return;
  }
  const source = element.attribs['src'];
  if (source !== undefined && !source.startsWith(DATA_IMAGE_SOURCE_PREFIX)) {
    delete element.attribs['src'];
  }
}
