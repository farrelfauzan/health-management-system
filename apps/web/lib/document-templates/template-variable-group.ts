import type { TemplateVariable } from '@hms/shared-types';

export type TemplateVariableGroup = {
  readonly prefix: string;
  readonly variables: readonly TemplateVariable[];
};
