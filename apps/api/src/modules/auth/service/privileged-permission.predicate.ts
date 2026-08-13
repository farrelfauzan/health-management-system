/**
 * Permission keys that make an account privileged, as `resource.action:scope`
 * patterns where `*` matches one segment (SJ-8).
 *
 * A pattern list, not a role list, and the difference is the whole point. Role
 * names drift: a clinic renames `ADMIN` to `CLINIC_MANAGER`, invents
 * `BILLING_SUPERVISOR`, or grants one dangerous permission to `RECEPTIONIST`
 * for an afternoon. Every one of those silently escapes a hardcoded role check
 * while leaving the capability intact. Matching on the capability means a role
 * that can do the damage requires the second factor, whatever it is called and
 * whenever it was created.
 *
 * Two families, for two different reasons:
 *
 * **Administrative control.** Anything that can grant permissions, create
 * users, or reconfigure an upstream integration can hand an attacker a durable
 * foothold that outlives the stolen password. `role.assign:any` is the sharpest
 * of these — it is the one permission that can promote its holder.
 *
 * **Bulk data egress.** `*.export` and `audit.read:any` return patient-
 * identifiable data by the thousand rather than one record at a time. The
 * regulatory exposure of one compromised session is measured in rows.
 *
 * Ordinary clinical work — reading the patient in front of you, writing an
 * encounter, dispensing a prescription — is deliberately absent. Making a
 * receptionist produce a code to open the day's appointment list would teach
 * the whole clinic to resent the control, and every bypass people invent for
 * it is worse than the control was good.
 */
const PRIVILEGED_PERMISSION_PATTERNS: readonly string[] = [
  '*.manage:any',
  '*.*.manage:any',
  '*.export:any',
  '*.export:own',
  '*.*.export:any',
  'user.create:any',
  'user.update:any',
  'role.assign:any',
  'role.unassign:any',
  'audit.read:any',
  'patient.merge:any',
];

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
