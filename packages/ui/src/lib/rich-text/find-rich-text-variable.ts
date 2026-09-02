import type { RichTextVariableDefinition } from '#lib/rich-text/rich-text-variable-definition';

export function findRichTextVariable(
  variables: readonly RichTextVariableDefinition[],
  token: string,
): RichTextVariableDefinition | undefined {
  return variables.find((variable) => variable.token === token);
}
