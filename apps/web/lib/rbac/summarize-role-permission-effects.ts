import { describePermissionEffects, type PortalShellValue } from '@hms/shared-types';

/**
 * What a selection does as a whole (P22-T04): which shells it opens, which of
 * its keys make its users enrol MFA, and which reach the clinical record. The
 * dialog turns this into warnings, because each was, on 2026-09-23, a real
 * role that silently did something its author did not expect.
 */
export function summarizeRolePermissionEffects(selected: ReadonlySet<string>): {
  portals: PortalShellValue[];
  mfaKeys: string[];
  clinicalKeys: string[];
} {
  const keys = [...selected].sort();
  const effects = keys.map((key) => ({ key, ...describePermissionEffects(key) }));
  return {
    portals: effects.flatMap((effect) => (effect.portal === null ? [] : [effect.portal])),
    mfaKeys: effects.filter((effect) => effect.requiresMfa).map((effect) => effect.key),
    clinicalKeys: effects.filter((effect) => effect.isClinicalContent).map((effect) => effect.key),
  };
}
