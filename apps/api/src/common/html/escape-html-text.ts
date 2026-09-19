/**
 * Escapes text for HTML element content or a quoted attribute value, for
 * documents built as strings (P27-T12). Ampersand first, so the entities the
 * later replacements introduce are not escaped again.
 */
export function escapeHtmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
