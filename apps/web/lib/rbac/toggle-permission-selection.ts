import { expandPermissionDependencies } from '@hms/shared-types';

import { selectPermissionKeys } from '#lib/rbac/select-permission-keys';

/**
 * One checkbox (or select-all) click in the permission matrix (P22-T04).
 * Ticking adds the keys and what they need. Unticking removes them, then puts
 * back whatever the keys that remain still need — so a key another ticked key
 * depends on stays ticked, while clearing a whole group also clears the reads
 * only that group's writes were holding in place. The API applies the same
 * closure on save.
 */
export function togglePermissionSelection(params: {
  selected: ReadonlySet<string>;
  keys: readonly string[];
  catalogKeys: ReadonlySet<string>;
}): Set<string> {
  const { selected, keys, catalogKeys } = params;
  const isAdding = keys.some((key) => !selected.has(key));
  if (isAdding) {
    return selectPermissionKeys(selected, keys, catalogKeys);
  }
  const removed = new Set(keys);
  const remaining = [...selected].filter((key) => !removed.has(key));
  return expandPermissionDependencies(remaining, catalogKeys);
}
