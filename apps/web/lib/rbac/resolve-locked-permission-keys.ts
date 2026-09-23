import { resolvePermissionRequirements } from '@hms/shared-types';

/**
 * The ticked keys another ticked key needs, each with the keys that need it
 * (P22-T04). The matrix renders these as locked: unticking one would be undone
 * on save anyway, so the checkbox says why instead of silently re-ticking.
 */
export function resolveLockedPermissionKeys(
  selected: ReadonlySet<string>,
  catalogKeys: ReadonlySet<string>,
): Map<string, string[]> {
  const locked = new Map<string, string[]>();
  for (const key of selected) {
    for (const requirement of resolvePermissionRequirements(key, catalogKeys)) {
      if (selected.has(requirement) && requirement !== key) {
        locked.set(requirement, [...(locked.get(requirement) ?? []), key]);
      }
    }
  }
  return locked;
}
