import type { z } from 'zod';

import type { roleTemplateCodeSchema } from '#rbac/schemas';

export type ActorPermissionScope = 'ANY' | 'OWN';

/** The shell a `portal.*` key opens (IMP-3). */
export type PortalShellValue = 'ADMIN' | 'DOCTOR' | 'PATIENT';

/** A starting point for a custom role in the IAM screen (P22-T05). */
export type RoleTemplateCodeValue = z.infer<typeof roleTemplateCodeSchema>;

/**
 * A named permission set an administrator can create a role from (P22-T05).
 * Its label and plain-language description live with the web messages.
 */
export type RoleTemplate = {
  code: RoleTemplateCodeValue;
  permissionKeys: readonly string[];
};

export type ActorPermission = {
  action: string;
  resource: string;
  scope: ActorPermissionScope;
};

export type Actor = {
  /**
   * True for a reserved service account — an actor that exists so
   * machine-originated writes are attributable, never a person who signed in
   * (P14-T04's BPJS Antrean bridge is the first). Rules that only a machine
   * may take, and rules that only a human may take, both read this.
   */
  isSystem?: boolean;
  roles: Array<{
    role: {
      permissions: Array<{
        permission: ActorPermission;
      }>;
    };
  }>;
};

export type ActorScopeResolution = {
  hasAny: boolean;
  hasOwn: boolean;
};

/** Repository projection of a `permissions` row. */
export type PermissionRecord = {
  id: string;
  permissionKey: string;
  resource: string;
  action: string;
  scope: ActorPermissionScope;
  description: string | null;
};

/** Repository projection of a `roles` row without relations. */
export type RoleRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** `RoleRecord` plus the list endpoint's member count. */
export type RoleListRecord = RoleRecord & {
  memberCount: number;
};

/** `RoleRecord` plus what the detail endpoint joins in. */
export type RoleWithPermissionsRecord = RoleRecord & {
  memberCount: number;
  permissions: PermissionRecord[];
};

export type CreateRolePayload = {
  code: string;
  name: string;
  description?: string;
};

export type UpdateRolePayload = {
  name?: string;
  description?: string | null;
};

export type ReplaceRolePermissionsPayload = {
  roleId: string;
  permissionIds: string[];
};

export type SoftDeleteRoleResult = {
  id: string;
  code: string;
  deletedAt: Date;
  revokedAssignmentCount: number;
};
