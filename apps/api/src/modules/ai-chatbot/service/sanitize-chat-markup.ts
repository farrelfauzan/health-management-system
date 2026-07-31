const SCRIPT_OR_STYLE_BLOCK = /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SELF_CLOSING_DANGEROUS_TAG = /<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi;
const ANY_HTML_TAG = /<\/?[a-z][^>]*>/gi;
const DANGEROUS_URL_SCHEME = /\b(javascript|data|vbscript):/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Strips markup from a provider response (§3.3). Chat replies are rendered as
 * text, so the safe subset here is "no markup at all": script/style/iframe
 * blocks go with their contents (dropping the tag alone would leave the
 * script body as visible text), every other tag is unwrapped so its readable
 * text survives, and `javascript:`/`data:` URL schemes are defanged in case
 * a client ever renders links.
 *
 * Returns the cleaned text and whether anything changed, so the caller can
 * tag the turn rather than silently altering what a patient was told.
 */
export function sanitizeChatMarkup(content: string): {
  content: string;
  wasModified: boolean;
} {
  const sanitized = content
    .replace(HTML_COMMENT, '')
    .replace(SCRIPT_OR_STYLE_BLOCK, '')
    .replace(SELF_CLOSING_DANGEROUS_TAG, '')
    .replace(ANY_HTML_TAG, '')
    .replace(DANGEROUS_URL_SCHEME, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return { content: sanitized, wasModified: sanitized !== content.trim() };
}
