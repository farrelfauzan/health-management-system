import { ConvertedDocxTemplate, TEMPLATE_VARIABLES_BY_KIND } from '@hms/shared-types';

const TOKEN_ATTRIBUTE = 'data-hms-var';
const ITEMS_BLOCK_TOKEN = 'items';
/** `{{ clinic.name }}` as a person types it in Word, spaces tolerated. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)?)\s*\}\}/g;
/** A paragraph holding nothing but the items placeholder, possibly emphasised. */
const ITEMS_PARAGRAPH_PATTERN =
  /<p>(?:<(?:strong|em|b|i|u)>)*\s*\{\{\s*items\s*\}\}\s*(?:<\/(?:strong|em|b|i|u)>)*<\/p>/g;

/**
 * Turns the placeholders a clinic typed into its Word file into the
 * editor's variable chips (`P16-T42`). `{{items}}` on a line of its own
 * becomes the line-item block; every other registry token becomes the
 * canonical empty span the sanitiser produces. A placeholder the registry
 * does not know stays as typed and is reported, so the author sees it in
 * the editor rather than as a blank on a receipt.
 */
export function convertPlaceholdersToTokens(html: string): ConvertedDocxTemplate {
  const known = new Set(TEMPLATE_VARIABLES_BY_KIND.INVOICE.map((variable) => variable.token));
  const unknown = new Set<string>();
  const withBlock = html.replace(
    ITEMS_PARAGRAPH_PATTERN,
    `<div ${TOKEN_ATTRIBUTE}="${ITEMS_BLOCK_TOKEN}"></div>`,
  );
  const converted = withBlock.replace(PLACEHOLDER_PATTERN, (match, token: string) => {
    if (token === ITEMS_BLOCK_TOKEN) {
      return `<div ${TOKEN_ATTRIBUTE}="${ITEMS_BLOCK_TOKEN}"></div>`;
    }
    if (!known.has(token)) {
      unknown.add(token);
      return match;
    }
    return `<span ${TOKEN_ATTRIBUTE}="${token}"></span>`;
  });
  return {
    html: converted,
    warnings: [...unknown].map((token) => ({
      code: 'UNKNOWN_PLACEHOLDER',
      message: `{{${token}}} is not a template variable and was left as text`,
      detail: token,
    })),
  };
}
