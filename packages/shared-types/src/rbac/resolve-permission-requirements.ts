import { EXPLICIT_PERMISSION_DEPENDENCIES } from '#rbac/explicit-permission-dependencies';

const WRITE_KEY_PATTERN = /^(?<resource>.+)\.write:(?<scope>any|own)$/;

/**
 * The keys one permission directly needs to be usable (P22-T04): its explicit
 * dependencies, and — for a `write` — the `read` of the same resource and
 * scope when the catalogue defines one. A form that saves what it cannot load
 * is not a permission, it is a support call; every seeded role already pairs
 * the two, which `permission-dependencies.spec.ts` checks.
 *
 * Only `write`: other verbs such as `admit` or `create-newborn` are held
 * without their resource's `read` on purpose (D-033 keeps `patient.read:any`
 * from doctors), so widening the rule would hand out access nobody decided.
 */
export function resolvePermissionRequirements(
  permissionKey: string,
  catalogKeys: ReadonlySet<string>,
): string[] {
  const explicitKeys = EXPLICIT_PERMISSION_DEPENDENCIES[permissionKey] ?? [];
  const writeMatch = WRITE_KEY_PATTERN.exec(permissionKey)?.groups;
  const readKey = writeMatch ? `${writeMatch.resource}.read:${writeMatch.scope}` : null;
  const derivedKeys = readKey !== null && catalogKeys.has(readKey) ? [readKey] : [];
  return [...explicitKeys, ...derivedKeys].filter((key) => catalogKeys.has(key));
}
