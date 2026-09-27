import type { ModuleGroupId } from '#lib/landing/module-group-id';

/** A family of modules and the accent colour its badges and step markers use. */
export type ModuleGroup = {
  readonly id: ModuleGroupId;
  readonly label: string;
  readonly color: string;
};
