import { resolvePermissionRequirements } from '#rbac/resolve-permission-requirements';

/**
 * A permission set closed over its requirements (P22-T04): every key it holds,
 * plus every key those need, transitively. The API saves a role's permissions
 * through this, so a dependency cannot be dropped by leaving it unticked, and
 * the IAM screen ticks through it, so what the administrator sees before saving
 * is what gets saved.
 */
export function expandPermissionDependencies(
  permissionKeys: Iterable<string>,
  catalogKeys: ReadonlySet<string>,
): Set<string> {
  const expanded = new Set<string>();
  const pending = [...permissionKeys];
  while (pending.length > 0) {
    const key = pending.pop() as string;
    if (!expanded.has(key)) {
      expanded.add(key);
      pending.push(...resolvePermissionRequirements(key, catalogKeys));
    }
  }
  return expanded;
}
