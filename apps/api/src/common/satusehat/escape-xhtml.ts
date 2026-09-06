/**
 * Escapes free clinician text for a FHIR `Narrative.div`, which is XHTML.
 *
 * This is the first place a doctor's own prose leaves the system as markup, so
 * the rule is that markup typed into a note arrives as literal characters:
 * a plan written with `<b>` shows angle brackets on the receiving system, not
 * bold text. Escaping the five XML entities is sufficient because the result
 * is only ever inserted as element content or an attribute value, never as a
 * tag name or an unquoted attribute.
 *
 * Ampersand is replaced first — doing it after the others would re-escape the
 * ampersands those replacements just introduced and turn `<` into `&amp;lt;`.
 */
export function escapeXhtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
