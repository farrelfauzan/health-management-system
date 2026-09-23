import { PRIVILEGED_PERMISSION_PATTERNS } from '#rbac/privileged-permission-patterns';

/**
 * Turns one pattern into a matcher. Segments split on `.` and `:` so that `*`
 * never spans a separator — `*.export:any` must not match `patient.read:any`
 * because a greedy wildcard swallowed `read`.
 */
function buildPatternMatcher(pattern: string): RegExp {
  const escaped = pattern
    .split(/([.:])/)
    .map((segment) => {
      if (segment === '.' || segment === ':') {
        return `\\${segment}`;
      }
      return segment === '*' ? '[^.:]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${escaped}$`);
}

const PRIVILEGED_PERMISSION_MATCHERS: readonly RegExp[] =
  PRIVILEGED_PERMISSION_PATTERNS.map(buildPatternMatcher);

/**
 * Every permission the holder has that requires a second factor; empty when
 * none does, which is how callers ask the yes/no question.
 *
 * Returning the matches rather than a boolean is deliberate: "MFA was demanded
 * and nobody could say which grant caused it" is a support burden, and the
 * answer is already computed here. It goes into the audit row.
 *
 * A `SUPER_ADMIN` matches through the permissions its role actually grants,
 * not through its name — the seed gives that role every permission in the
 * table, several of which are on the list above.
 */
export function findPrivilegedPermissions(permissionKeys: readonly string[]): string[] {
  return permissionKeys
    .filter((permissionKey) =>
      PRIVILEGED_PERMISSION_MATCHERS.some((matcher) => matcher.test(permissionKey.toLowerCase())),
    )
    .sort();
}
