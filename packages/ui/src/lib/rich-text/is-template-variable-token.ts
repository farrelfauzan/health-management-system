/**
 * The token grammar of the API's template sanitiser
 * (`sanitise-template-html.ts`): a lowercase-led identifier with at most one
 * dotted segment. Anything else is dropped server-side, so the editor refuses
 * to build a chip for it rather than round-tripping something the save will
 * silently lose.
 */
const TEMPLATE_VARIABLE_TOKEN_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)?$/;

export function isTemplateVariableToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && TEMPLATE_VARIABLE_TOKEN_PATTERN.test(value);
}
