import {
  BASELINE_ROLE_PERMISSION_KEYS,
  CreateRoleInput,
  describePermissionEffects,
  expandPermissionDependencies,
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionRecord,
  RoleDeletion,
  RoleDetail,
  RoleListItem,
  RoleRecord,
  RoleSummary,
  resolvePermissionRequirements,
  ROLE_TEMPLATES,
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

  async getRoles(): Promise<RoleListItem[]> {
    const roles = await this.rbacRepository.findActiveRoles();
    return roles.map((role) => ({ ...this.toRoleSummary(role), memberCount: role.memberCount }));
  }

  /**
   * The permission catalog is code-owned: rows come from `seed.sql`, never
   * from an endpoint. Customers compose roles from it, AWS-managed-policy
   * style, which is why this is read-only and grouped for a matrix UI.
   */
  async getPermissionCatalog(): Promise<PermissionCatalogGroup[]> {
    const permissions = await this.rbacRepository.findPermissionCatalog();
    const catalogKeys = this.toCatalogKeys(permissions);
    const groups = new Map<string, PermissionCatalogEntry[]>();
    for (const permission of permissions) {
      const entries = groups.get(permission.resource) ?? [];
      entries.push(this.toPermissionEntry(permission, catalogKeys));
      groups.set(permission.resource, entries);
    }
    return Array.from(groups, ([resource, entries]) => ({ resource, permissions: entries }));
  }

  async getRoleById(roleId: string): Promise<RoleDetail> {
    const role = await this.rbacRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    const catalogKeys = this.toCatalogKeys(await this.rbacRepository.findPermissionCatalog());
    return {
      ...this.toRoleSummary(role),
      memberCount: role.memberCount,
      permissions: role.permissions.map((permission) =>
        this.toPermissionEntry(permission, catalogKeys),
      ),
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
    const { templateCode, ...roleInput } = input;
    const role = await this.rbacRepository.createRole(roleInput);
    // P22-T05. A template's keys are granted with the role, closed over their
    // dependencies exactly as a later save would close them.
    const templateKeys = this.findTemplateKeys(templateCode);
    const templatePermissions =
      templateKeys.length > 0 ? await this.rbacRepository.findPermissionsByKeys(templateKeys) : [];
    const baselinePermissions = await this.findBaselinePermissions();
    const grantedPermissions = this.mergePermissions(
      this.mergePermissions(templatePermissions, await this.findDependencyPermissions(templateKeys)),
      baselinePermissions,
    );
    await this.rbacRepository.replaceRolePermissions({
      roleId: role.id,
      permissionIds: grantedPermissions.map((permission) => permission.id),
    });
    await this.auditService.record({
      action: AuditAction.ROLE_CREATED,
      resource: 'role',
      actorUserId,
      resourceId: role.id,
      metadata: {
        roleCode: role.code,
        name: role.name,
        baselinePermissionKeys: baselinePermissions.map((permission) => permission.permissionKey),
        templateCode: templateCode ?? null,
      },
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
    // P22-T03. The baseline rides along with whatever was ticked, so unticking
    // "sign out" in the IAM screen cannot leave a role's users unable to.
    // P22-T04. What a ticked key needs rides along too, so leaving a
    // dependency unticked cannot save a permission nobody can use.
    const dependencyPermissions = await this.findDependencyPermissions(requestedKeys);
    const grantedPermissions = this.mergePermissions(
      this.mergePermissions(permissions, dependencyPermissions),
      await this.findBaselinePermissions(),
    );
    const grantedKeys = grantedPermissions.map((permission) => permission.permissionKey);
    await this.rbacRepository.replaceRolePermissions({
      roleId,
      permissionIds: grantedPermissions.map((permission) => permission.id),
    });
    const previousKeys = current.permissions.map((permission) => permission.permissionKey);
    await this.auditService.record({
      action: AuditAction.ROLE_PERMISSIONS_CHANGED,
      resource: 'role',
      actorUserId,
      resourceId: roleId,
      metadata: {
        roleCode: current.code,
        added: grantedKeys.filter((key) => !previousKeys.includes(key)).sort(),
        removed: previousKeys.filter((key) => !grantedKeys.includes(key)).sort(),
        addedAsDependencies: dependencyPermissions
          .map((permission) => permission.permissionKey)
          .filter((key) => !previousKeys.includes(key))
          .sort(),
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

  /**
   * The baseline keys the catalogue actually holds. A catalogue missing one —
   * an unseeded database — grants the rest rather than refusing a request
   * whose caller never named it.
   */
  private async findBaselinePermissions(): Promise<PermissionRecord[]> {
    return this.rbacRepository.findPermissionsByKeys([...BASELINE_ROLE_PERMISSION_KEYS]);
  }

  private findTemplateKeys(templateCode: CreateRoleInput['templateCode']): string[] {
    const template = ROLE_TEMPLATES.find((candidate) => candidate.code === templateCode);
    return template ? [...template.permissionKeys] : [];
  }

  /** The catalogue rows the requested keys need but did not name (P22-T04). */
  private async findDependencyPermissions(requestedKeys: string[]): Promise<PermissionRecord[]> {
    const catalogKeys = this.toCatalogKeys(await this.rbacRepository.findPermissionCatalog());
    const requested = new Set(requestedKeys);
    const dependencyKeys = [...expandPermissionDependencies(requestedKeys, catalogKeys)].filter(
      (key) => !requested.has(key),
    );
    if (dependencyKeys.length === 0) {
      return [];
    }
    return this.rbacRepository.findPermissionsByKeys(dependencyKeys);
  }

  private toCatalogKeys(permissions: PermissionRecord[]): Set<string> {
    return new Set(permissions.map((permission) => permission.permissionKey));
  }

  private mergePermissions(
    requested: PermissionRecord[],
    baseline: PermissionRecord[],
  ): PermissionRecord[] {
    const byKey = new Map(requested.map((permission) => [permission.permissionKey, permission]));
    baseline.forEach((permission) => byKey.set(permission.permissionKey, permission));
    return [...byKey.values()];
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

  private toPermissionEntry(
    permission: PermissionRecord,
    catalogKeys: ReadonlySet<string>,
  ): PermissionCatalogEntry {
    return {
      id: permission.id,
      permissionKey: permission.permissionKey,
      resource: permission.resource,
      action: permission.action,
      scope: permission.scope,
      description: permission.description ?? undefined,
      requires: resolvePermissionRequirements(permission.permissionKey, catalogKeys),
      effects: describePermissionEffects(permission.permissionKey),
    };
  }
}
