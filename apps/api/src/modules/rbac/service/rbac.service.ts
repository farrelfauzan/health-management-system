import {
  CreateRoleInput,
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionRecord,
  RoleDeletion,
  RoleDetail,
  RoleRecord,
  RoleSummary,
  SetRolePermissionsInput,
  UpdateRoleInput,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
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

  async createRole(input: CreateRoleInput): Promise<RoleSummary> {
    const existing = await this.rbacRepository.findAnyRoleByCode(input.code);
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? 'Role code belongs to a deleted role and cannot be reused'
          : 'Role code already exists',
      );
    }
    const role = await this.rbacRepository.createRole(input);
    return this.toRoleSummary(role);
  }

  async updateRole(roleId: string, input: UpdateRoleInput): Promise<RoleSummary> {
    await this.ensureRoleExists(roleId);
    const role = await this.rbacRepository.updateRole(roleId, input);
    return this.toRoleSummary(role);
  }

  async deleteRole(roleId: string, deletedById: string): Promise<RoleDeletion> {
    await this.ensureRoleExists(roleId);
    const result = await this.rbacRepository.softDeleteRole(roleId, deletedById);
    return { ...result, deletedAt: result.deletedAt.toISOString() };
  }

  async setRolePermissions(roleId: string, input: SetRolePermissionsInput): Promise<RoleDetail> {
    await this.ensureRoleExists(roleId);
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

  private async ensureRoleExists(roleId: string): Promise<void> {
    const role = await this.rbacRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
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
