import type { PermissionEffects } from '#rbac/contracts';
import { CLINICAL_CONTENT_PERMISSION_KEYS } from '#rbac/clinical-content-permission-keys';
import { findPrivilegedPermissions } from '#rbac/find-privileged-permissions';
import { PORTAL_SHELL_BY_PERMISSION_KEY } from '#rbac/portal-shell-by-permission-key';

/**
 * What ticking a key does beyond its own screen (P22-T04): whether its holders
 * must enrol a second factor (SJ-8), which shell it opens (IMP-3), and whether
 * it reaches the patient's clinical record (D-033). Each answer is read from
 * the same list the enforcing code reads, so the label cannot disagree with
 * what login, `proxy.ts` or the seed actually do.
 */
export function describePermissionEffects(permissionKey: string): PermissionEffects {
  return {
    requiresMfa: findPrivilegedPermissions([permissionKey]).length > 0,
    portal: PORTAL_SHELL_BY_PERMISSION_KEY[permissionKey] ?? null,
    isClinicalContent: CLINICAL_CONTENT_PERMISSION_KEYS.includes(permissionKey),
  };
}
