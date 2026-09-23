/*
 * Moved here from the API's auth module (P22-T04) so the IAM screen labels
 * the same keys that login enforces: one list, read by both.
 */
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
 * of these — it is the one permission that can promote its holder — and the
 * `role.create/update/delete` trio sits beside it because rewriting what a
 * role grants is the same promotion by another route.
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
export const PRIVILEGED_PERMISSION_PATTERNS: readonly string[] = [
  '*.manage:any',
  '*.*.manage:any',
  '*.export:any',
  '*.export:own',
  '*.*.export:any',
  'user.create:any',
  'user.update:any',
  'role.assign:any',
  'role.unassign:any',
  // IMP-2: composing a role is one step removed from assigning it — a role
  // that can be given any permission set is a promotion waiting for a holder.
  'role.create:any',
  'role.update:any',
  'role.delete:any',
  'audit.read:any',
  'patient.merge:any',
];
