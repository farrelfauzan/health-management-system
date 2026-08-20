import {
  CreateRolePayload,
  PermissionRecord,
  ReplaceRolePermissionsPayload,
  RoleListRecord,
  RoleRecord,
  RoleWithPermissionsRecord,
  SoftDeleteRoleResult,
  UpdateRolePayload,
} from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PERMISSION_SELECT = {
  id: true,
  permissionKey: true,
  resource: true,
  action: true,
  scope: true,
  description: true,
} as const;

@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveRoles(): Promise<RoleListRecord[]> {
    const roles = await this.prisma.findManyActive(this.prisma.role, {
      orderBy: {
        name: 'asc',
      },
      select: {
        ...ROLE_SELECT,
        _count: {
          select: { users: { where: { deletedAt: null } } },
        },
      },
    });
    return roles.map(({ _count, ...role }) => ({ ...role, memberCount: _count.users }));
  }

  /** The whole catalog, ordered so grouping by resource is a single pass. */
  async findPermissionCatalog(): Promise<PermissionRecord[]> {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }, { scope: 'asc' }],
      select: PERMISSION_SELECT,
    });
  }

  async findPermissionsByKeys(permissionKeys: string[]): Promise<PermissionRecord[]> {
    return this.prisma.permission.findMany({
      where: { permissionKey: { in: permissionKeys } },
      select: PERMISSION_SELECT,
    });
  }

  async findRoleById(roleId: string): Promise<RoleWithPermissionsRecord | null> {
    const role = await this.prisma.findUniqueActive(this.prisma.role, {
      where: { id: roleId },
      select: {
        ...ROLE_SELECT,
        permissions: {
          orderBy: { permission: { permissionKey: 'asc' } },
          select: { permission: { select: PERMISSION_SELECT } },
        },
        _count: {
          select: { users: { where: { deletedAt: null } } },
        },
      },
    });
    if (!role) {
      return null;
    }
    const { permissions, _count, ...roleFields } = role;
    return {
      ...roleFields,
      memberCount: _count.users,
      permissions: permissions.map((rolePermission) => rolePermission.permission),
    };
  }

  async findRoleByCode(code: string): Promise<RoleRecord | null> {
    return this.prisma.findUniqueActive(this.prisma.role, {
      where: { code },
      select: ROLE_SELECT,
    });
  }

  /**
   * Includes soft-deleted rows on purpose: `code` is a DB-unique column, so a
   * deleted role still occupies its code and a create must see that.
   */
  async findAnyRoleByCode(code: string): Promise<{ id: string; deletedAt: Date | null } | null> {
    return this.prisma.role.findUnique({
      where: { code },
      select: { id: true, deletedAt: true },
    });
  }

  async createRole(payload: CreateRolePayload): Promise<RoleRecord> {
    return this.prisma.role.create({
      data: {
        code: payload.code,
        name: payload.name,
        description: payload.description,
        isSystem: false,
      },
      select: ROLE_SELECT,
    });
  }

  async updateRole(roleId: string, payload: UpdateRolePayload): Promise<RoleRecord> {
    return this.prisma.role.update({
      where: { id: roleId },
      data: payload,
      select: ROLE_SELECT,
    });
  }

  /**
   * Soft-deletes the role and revokes every active assignment in the same
   * transaction. Without the second step a deleted role would keep granting:
   * the guard resolves permissions through `user_roles`, which does not look
   * at `roles.deleted_at`.
   */
  async softDeleteRole(roleId: string, deletedById: string): Promise<SoftDeleteRoleResult> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.userRole.updateMany({
        where: { roleId, deletedAt: null },
        data: { deletedAt: now, unassignedAt: now, unassignedById: deletedById },
      });
      const role = await tx.role.update({
        where: { id: roleId },
        data: { deletedAt: now },
        select: { id: true, code: true },
      });
      return { ...role, deletedAt: now, revokedAssignmentCount: revoked.count };
    });
  }

  /**
   * Replaces the attachment set by diffing against the current
   * `role_permissions` rows — untouched grants keep their `created_at`, so
   * "since when has this role held X" stays answerable.
   */
  async replaceRolePermissions(payload: ReplaceRolePermissionsPayload): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: payload.roleId,
          permissionId: { notIn: payload.permissionIds },
        },
      });
      await tx.rolePermission.createMany({
        data: payload.permissionIds.map((permissionId) => ({
          roleId: payload.roleId,
          permissionId,
        })),
        skipDuplicates: true,
      });
    });
  }

  async assignRole(userId: string, roleCode: string, assignedById: string) {
    const role = await this.prisma.findUniqueActive(this.prisma.role, {
      where: { code: roleCode },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      update: {
        assignedById,
        assignedAt: new Date(),
        deletedAt: null,
        unassignedById: null,
        unassignedAt: null,
      },
      create: {
        userId,
        roleId: role.id,
        assignedById,
      },
      select: {
        id: true,
        userId: true,
        roleId: true,
        assignedAt: true,
      },
    });
  }

  async unassignRole(userId: string, roleCode: string, unassignedById: string) {
    const role = await this.prisma.findUniqueActive(this.prisma.role, {
      where: { code: roleCode },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const userRole = await this.prisma.findUniqueActive(this.prisma.userRole, {
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      select: {
        id: true,
        userId: true,
        roleId: true,
      },
    });

    if (!userRole) {
      throw new NotFoundException('Role assignment not found');
    }

    return this.prisma.userRole.update({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      data: {
        unassignedById,
        unassignedAt: new Date(),
        deletedAt: new Date(),
      },
      select: {
        id: true,
        userId: true,
        roleId: true,
        unassignedAt: true,
      },
    });
  }
}
