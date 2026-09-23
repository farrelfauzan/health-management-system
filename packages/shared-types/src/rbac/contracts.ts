import type { ActorPermissionScope, PortalShellValue } from '#rbac/types';

/** One row of the code-owned permission catalog (`GET /rbac/permissions`). */
export type PermissionCatalogEntry = {
  id: string;
  permissionKey: string;
  resource: string;
  action: string;
  scope: ActorPermissionScope;
  /** Absent when the catalog row carries no description. */
  description?: string;
  /**
   * Keys this one needs to be usable, which saving a role adds for it
   * (P22-T04). Direct requirements only; the API closes over them.
   */
  requires: string[];
  /** What holding this key does beyond its own screen (P22-T04). */
  effects: PermissionEffects;
};

/**
 * Side effects of one permission key, shown next to its checkbox in the IAM
 * screen (P22-T04) so an administrator sees them before saving, not after a
 * user reports being locked out.
 */
export type PermissionEffects = {
  /** Holders must enrol a second factor (SJ-8). */
  requiresMfa: boolean;
  /** The shell this key opens, or null for an ordinary key (IMP-3). */
  portal: PortalShellValue | null;
  /** Reaches the patient's clinical record under D-033. */
  isClinicalContent: boolean;
};

/** Catalog rows grouped by resource, so a permission matrix renders one row per resource. */
export type PermissionCatalogGroup = {
  resource: string;
  permissions: PermissionCatalogEntry[];
};

/** A role as listed by `GET /rbac/roles`. */
export type RoleSummary = {
  id: string;
  code: string;
  name: string;
  /** Absent when the role has no description. */
  description?: string;
  isSystem: boolean;
};

/** A `GET /rbac/roles` row: the summary plus how many active users hold it. */
export type RoleListItem = RoleSummary & {
  memberCount: number;
};

/** A role with its attached permissions and active member count (`GET /rbac/roles/:id`). */
export type RoleDetail = RoleSummary & {
  memberCount: number;
  permissions: PermissionCatalogEntry[];
  createdAt: string;
  updatedAt: string;
};

/** The confirmation returned by `DELETE /rbac/roles/:id`. */
export type RoleDeletion = {
  id: string;
  code: string;
  deletedAt: string;
  /** Active assignments revoked alongside the role, so no member keeps its grants. */
  revokedAssignmentCount: number;
};
