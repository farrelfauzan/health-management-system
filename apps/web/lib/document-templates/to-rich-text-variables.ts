import type { TemplateVariable } from '@hms/shared-types';
import type { RichTextVariableDefinition } from '@hms/ui';

import { resolveTemplateVariableLabel } from '#lib/document-templates/resolve-template-variable-label';

export function toRichTextVariables(
  variables: readonly TemplateVariable[],
  locale: string,
): RichTextVariableDefinition[] {
  return variables.map((variable) => ({
    token: variable.token,
    label: resolveTemplateVariableLabel(variable, locale),
  }));
}
