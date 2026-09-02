import { DocumentTemplateKindValue, TEMPLATE_VARIABLES_BY_KIND } from '@hms/shared-types';

import { extractTemplateTokens } from './extract-template-tokens';

type FindUnknownTemplateTokensParams = {
  readonly contentHtml: string;
  readonly kind: DocumentTemplateKindValue;
};

/**
 * Tokens the draft references that the registry for its kind does not know
 * (`P16-T12`). At render time such a token merely goes empty with a warning
 * (FR-E1-08); at publish time it is a blocking error, because a typo noticed
 * on a receipt is noticed too late.
 */
export function findUnknownTemplateTokens(params: FindUnknownTemplateTokensParams): string[] {
  const known = new Set(TEMPLATE_VARIABLES_BY_KIND[params.kind].map((variable) => variable.token));
  return extractTemplateTokens(params.contentHtml).filter((token) => !known.has(token));
}
