import type { TemplateVariable } from '@hms/shared-types';

import type { TemplateVariableGroup } from '#lib/document-templates/template-variable-group';

const TOKEN_SEPARATOR = '.';

/**
 * Groups registry entries by token prefix (`clinic.*`, `invoice.*`, …) in
 * first-seen order, so the palette reads the way the registry is written. A
 * token without a prefix (`items`) forms its own group.
 */
export function groupTemplateVariables(
  variables: readonly TemplateVariable[],
): TemplateVariableGroup[] {
  const groups = new Map<string, TemplateVariable[]>();
  for (const variable of variables) {
    const prefix = variable.token.split(TOKEN_SEPARATOR)[0] ?? variable.token;
    const bucket = groups.get(prefix) ?? [];
    bucket.push(variable);
    groups.set(prefix, bucket);
  }
  return [...groups.entries()].map(([prefix, grouped]) => ({ prefix, variables: grouped }));
}
