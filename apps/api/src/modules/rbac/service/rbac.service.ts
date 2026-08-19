import {
  CreateRoleInput,
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionRecord,
  RoleDeletion,
  RoleDetail,
  RoleRecord,
  RoleSummary,
  RoleWithPermissionsRecord,
  SetRolePermissionsInput,
  UpdateRoleInput,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { RbacRepository } from '../repository/rbac.repository';

@Injectable()
export class RbacService {
  constructor(
    private readonly rbacRepository: RbacRepository,
    private readonly auditService: AuditService,
  ) {}

  async getRoles(): Promise<RoleSummary[]> {
    const roles = await this.rbacRepository.findActiveRoles();
    return roles.map((role) => this.toRoleSummary(role));
  }

  /**
   * The permission catalog is code-owned: rows come from `seed.sql`, never
   * from an endpoint. Customers compose roles from it, AWS-managed-policy
   * style, which is why this is read-only and grouped for a matrix UI.
   */
  async getPermissionCatalog(): Promise<PermissionCatalogGroup[]> {
    const permissions = await this.rbacRepository.findPermissionCatalog();
    const groups = new Map<string, PermissionCatalogEntry[]>();
    for (const permission of permissions) {
      const entries = groups.get(permission.resource) ?? [];
      entries.push(this.toPermissionEntry(permission));
      groups.set(permission.resource, entries);
    }
    return Array.from(groups, ([resource, entries]) => ({ resource, permissions: entries }));
  }

  async getRoleById(roleId: string): Promise<RoleDetail> {
    const role = await this.rbacRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return {
      ...this.toRoleSummary(role),
      memberCount: role.memberCount,
      permissions: role.permissions.map((permission) => this.toPermissionEntry(permission)),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  async createRole(input: CreateRoleInput, actorUserId: string): Promise<RoleSummary> {
    const existing = await this.rbacRepository.findAnyRoleByCode(input.code);
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? 'Role code belongs to a deleted role and cannot be reused'
          : 'Role code already exists',
      );
    }
    const role = await this.rbacRepository.createRole(input);
    await this.auditService.record({
      action: AuditAction.ROLE_CREATED,
      resource: 'role',
      actorUserId,
      resourceId: role.id,
      metadata: { roleCode: role.code, name: role.name },
    });
    return this.toRoleSummary(role);
  }

  async updateRole(
    roleId: string,
    input: UpdateRoleInput,
    actorUserId: string,
  ): Promise<RoleSummary> {
    const current = await this.findMutableRole(roleId);
    const role = await this.rbacRepository.updateRole(roleId, input);
    await this.auditService.record({
      action: AuditAction.ROLE_UPDATED,
      resource: 'role',
      actorUserId,
      resourceId: role.id,
      metadata: {
        roleCode: role.code,
        before: { name: current.name, description: current.description },
        after: { name: role.name, description: role.description },
      },
    });
    return this.toRoleSummary(role);
  }

  async deleteRole(roleId: string, actorUserId: string): Promise<RoleDeletion> {
    await this.findMutableRole(roleId);
    const result = await this.rbacRepository.softDeleteRole(roleId, actorUserId);
    await this.auditService.record({
      action: AuditAction.ROLE_DELETED,
      resource: 'role',
      actorUserId,
      resourceId: result.id,
      metadata: { roleCode: result.code, revokedAssignmentCount: result.revokedAssignmentCount },
    });
    return { ...result, deletedAt: result.deletedAt.toISOString() };
  }

  async setRolePermissions(
    roleId: string,
    input: SetRolePermissionsInput,
    actorUserId: string,
  ): Promise<RoleDetail> {
    const current = await this.findMutableRole(roleId);
    const requestedKeys = Array.from(new Set(input.permissionKeys));
    const permissions = await this.rbacRepository.findPermissionsByKeys(requestedKeys);
    const unknownKeys = this.findUnknownKeys(requestedKeys, permissions);
    if (unknownKeys.length > 0) {
      throw new BadRequestException({
        message: 'Unknown permission keys',
        errors: { unknownKeys },
      });
    }
    await this.rbacRepository.replaceRolePermissions({
      roleId,
      permissionIds: permissions.map((permission) => permission.id),
    });
    const previousKeys = current.permissions.map((permission) => permission.permissionKey);
    await this.auditService.record({
      action: AuditAction.ROLE_PERMISSIONS_CHANGED,
      resource: 'role',
      actorUserId,
      resourceId: roleId,
      metadata: {
        roleCode: current.code,
        added: requestedKeys.filter((key) => !previousKeys.includes(key)).sort(),
        removed: previousKeys.filter((key) => !requestedKeys.includes(key)).sort(),
      },
    });
    return this.getRoleById(roleId);
  }

  async assignRole(userId: string, roleCode: string, assignedById: string) {
    const assignment = await this.rbacRepository.assignRole(userId, roleCode, assignedById);
    await this.auditService.record({
      action: AuditAction.ROLE_ASSIGNED,
      resource: 'user-role',
      actorUserId: assignedById,
      resourceId: userId,
      metadata: { roleCode },
    });
    return assignment;
  }

  async unassignRole(userId: string, roleCode: string, unassignedById: string) {
    const unassignment = await this.rbacRepository.unassignRole(userId, roleCode, unassignedById);
    await this.auditService.record({
      action: AuditAction.ROLE_UNASSIGNED,
      resource: 'user-role',
      actorUserId: unassignedById,
      resourceId: userId,
      metadata: { roleCode },
    });
    return unassignment;
  }

  /**
   * Resolves a role for mutation. Seeded roles carry `isSystem = true` and
   * are refused here (IMP-2): their shape is owned by `seed.sql`, and a
   * super admin editing SUPER_ADMIN's own permission set is the one change
   * that can lock everyone out of the fix.
   */
  private async findMutableRole(roleId: string): Promise<RoleWithPermissionsRecord> {
    const role = await this.rbacRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be modified');
    }
    return role;
  }

  private findUnknownKeys(requestedKeys: string[], found: PermissionRecord[]): string[] {
    const knownKeys = new Set(found.map((permission) => permission.permissionKey));
    return requestedKeys.filter((key) => !knownKeys.has(key));
  }

  private toRoleSummary(role: RoleRecord): RoleSummary {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description ?? undefined,
      isSystem: role.isSystem,
    };
  }

  private toPermissionEntry(permission: PermissionRecord): PermissionCatalogEntry {
    return {
      id: permission.id,
      permissionKey: permission.permissionKey,
      resource: permission.resource,
      action: permission.action,
      scope: permission.scope,
      description: permission.description ?? undefined,
    };
  }
}
