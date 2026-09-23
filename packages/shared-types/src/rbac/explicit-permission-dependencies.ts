/**
 * Keys that another key cannot work without, where the reason is not the
 * general rule in {@link resolvePermissionRequirements} (P22-T04).
 *
 * Each entry is a key whose only screen lives in one shell, so holding it
 * without that shell's portal key is a permission nobody can reach. Kept
 * short on purpose: an entry here is a promise the IAM screen makes to an
 * administrator, and each one is pinned by `permission-dependencies.spec.ts`
 * against the seeded roles.
 */
export const EXPLICIT_PERMISSION_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  // P22-T03. The vitals card is on the admin encounter page and nowhere else.
  'encounter.record-vitals:any': ['portal.admin-access:any'],
};
