import { expandPermissionDependencies } from '@hms/shared-types';

/**
 * Ticks a key and everything it needs (P22-T04), the same closure the API
 * applies on save, so the matrix shows before saving exactly what will be
 * saved.
 */
export function selectPermissionKeys(
  selected: ReadonlySet<string>,
  keys: readonly string[],
  catalogKeys: ReadonlySet<string>,
): Set<string> {
  return new Set([...selected, ...expandPermissionDependencies(keys, catalogKeys)]);
}
