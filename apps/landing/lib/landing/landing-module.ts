import type { FlowStep } from '#lib/landing/flow-step';
import type { LineIconName } from '#lib/landing/line-icon-name';
import type { ModuleGroupId } from '#lib/landing/module-group-id';

/** A product module shown as a badge, with the workflow it reveals when picked. */
export type LandingModule = {
  readonly id: string;
  readonly name: string;
  readonly groupId: ModuleGroupId;
  readonly icon: LineIconName;
  readonly summary: string;
  readonly steps: readonly FlowStep[];
};
