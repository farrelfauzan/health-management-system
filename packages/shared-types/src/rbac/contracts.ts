import type { ActorPermissionScope } from '#rbac/types';

/** One row of the code-owned permission catalog (`GET /rbac/permissions`). */
export type PermissionCatalogEntry = {
  id: string;
  permissionKey: string;
  resource: string;
  action: string;
  scope: ActorPermissionScope;
  /** Absent when the catalog row carries no description. */
  description?: string;
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
