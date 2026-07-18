import { ListUsersParams } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AdminManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(params: ListUsersParams) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = {
      ...(search
        ? {
            email: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const users = await this.prisma.findManyActive(tx.user, {
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          roles: {
            where: {
              deletedAt: null,
            },
            include: {
              role: true,
            },
          },
        },
      });

      const count = await this.prisma.countActive(tx.user, { where });

      return [users, count] as const;
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findActiveUserById(id: string) {
    return this.prisma.findUniqueActive(this.prisma.user, {
      where: {
        id,
      },
      include: {
        roles: {
          where: {
            deletedAt: null,
          },
          include: {
            role: true,
          },
        },
      },
    });
  }

  async findActiveUserByEmail(email: string) {
    return this.prisma.findUniqueActive(this.prisma.user, {
      where: {
        email,
      },
      select: {
        id: true,
      },
    });
  }

  async findActiveRolesByCodes(roleCodes: string[]) {
    if (roleCodes.length === 0) {
      return [];
    }

    return this.prisma.findManyActive(this.prisma.role, {
      where: {
        code: {
          in: roleCodes,
        },
      },
      select: {
        id: true,
        code: true,
      },
    });
  }

  async createUserWithRoles(payload: {
    email: string;
    passwordHash: string;
    isActive: boolean;
    roleIds: string[];
    assignedById: string;
  }) {
    const { email, passwordHash, isActive, roleIds, assignedById } = payload;

    const created = await this.prisma.executeTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          isActive,
        },
        select: {
          id: true,
        },
      });

      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
          assignedById,
        })),
      });

      return user;
    });

    return this.findActiveUserById(created.id);
  }

  async updateUserWithRoles(payload: {
    userId: string;
    email?: string;
    passwordHash?: string;
    isActive?: boolean;
    roleIds?: string[];
    updatedById: string;
  }) {
    const { userId, email, passwordHash, isActive, roleIds, updatedById } = payload;

    await this.prisma.executeTransaction(async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          ...(email !== undefined ? { email } : {}),
          ...(passwordHash !== undefined ? { passwordHash } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      if (roleIds) {
        const activeUserRoles = await tx.userRole.findMany({
          where: {
            userId,
            deletedAt: null,
          },
          select: {
            roleId: true,
          },
        });

        const activeRoleIds = new Set(activeUserRoles.map((item) => item.roleId));
        const targetRoleIds = new Set(roleIds);

        const roleIdsToDeactivate = activeUserRoles
          .map((item) => item.roleId)
          .filter((roleId) => !targetRoleIds.has(roleId));

        if (roleIdsToDeactivate.length > 0) {
          await tx.userRole.updateMany({
            where: {
              userId,
              roleId: {
                in: roleIdsToDeactivate,
              },
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
              unassignedAt: new Date(),
              unassignedById: updatedById,
            },
          });
        }

        const roleIdsToActivate = roleIds.filter((roleId) => !activeRoleIds.has(roleId));

        for (const roleId of roleIdsToActivate) {
          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId,
                roleId,
              },
            },
            update: {
              deletedAt: null,
              assignedAt: new Date(),
              assignedById: updatedById,
              unassignedAt: null,
              unassignedById: null,
            },
            create: {
              userId,
              roleId,
              assignedById: updatedById,
            },
          });
        }
      }
    });

    return this.findActiveUserById(userId);
  }
}
