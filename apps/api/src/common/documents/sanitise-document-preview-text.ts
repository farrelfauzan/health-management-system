import * as domutils from 'domutils';
import * as htmlparser2 from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';

/**
 * Turns a stored document's extracted text into text that is safe to hand a
 * browser (`P19-T18`, NFR-SEC-01).
 *
 * The file this runs over is operator-uploaded, and markdown admits raw HTML,
 * so what comes out of the extractor may contain markup that was never meant
 * to render. The registry's posture on uploaded bodies is that they are never
 * framed in this origin (NFR-SEC-04); a preview does not relax that, it
 * satisfies it by never producing markup in the first place.
 *
 * Three passes, in this order:
 *
 *   1. **Markup is removed, not escaped.** `sanitize-html` with an empty
 *      allowlist drops every tag, and — through its `nonTextTags` default —
 *      drops the *contents* of `script`, `style`, `textarea` and `option`
 *      as well, so a script body never survives as readable prose either.
 *   2. **Entities are decoded back to characters.** Pass one escapes what it
 *      keeps, which would show a reader `&amp;` where the document says `&`.
 *      The output of pass one has no tags left, so parsing it yields text
 *      nodes and nothing else.
 *   3. **Control characters are dropped and line endings normalised**, so a
 *      file with CRLF endings or embedded NULs reads the same as one without.
 *
 * The result is a string with no active content on any path — the web renders
 * it as a text node rather than as HTML, and both facts hold independently.
 *
 * The cost is named rather than hidden: a markdown file that *displays* raw
 * HTML — an autolink written `<https://…>`, a quoted tag — loses those angle
 * brackets here, because nothing downstream can tell a tag a reader wanted to
 * see from one an attacker wanted rendered. A preview is for reading before a
 * decision; the signed download remains the way to read the file byte for
 * byte.
 */
const STRIP_ALL_MARKUP: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/**
 * Everything below U+0020 except tab and newline, plus DEL. Matching control
 * characters is the whole point of this pattern, so `no-control-regex` — which
 * exists to catch them written by accident — is off for this line only.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitiseDocumentPreviewText(rawText: string): string {
  const withoutMarkup = sanitizeHtml(rawText, STRIP_ALL_MARKUP);
  const decoded = decodeTextEntities(withoutMarkup);
  return decoded.replace(/\r\n?/g, '\n').replace(CONTROL_CHARACTERS, '');
}

/**
 * Reads the text back out of pass one's output. `domutils.textContent`
 * concatenates the parsed text nodes with entities already resolved, which is
 * the decode this needs without hand-rolling an entity table.
 */
function decodeTextEntities(escapedText: string): string {
  const dom = htmlparser2.parseDocument(escapedText);
  return domutils.textContent(dom);
}
