import { ListUsersParams, OffboardedUserRecord } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AdminManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(params: ListUsersParams) {
    const { page, limit, search, roleCode, isActive } = params;
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
      ...(isActive !== undefined ? { isActive } : {}),
      ...(roleCode
        ? {
            roles: {
              some: {
                deletedAt: null,
                role: {
                  code: roleCode,
                },
              },
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
          // SJ-89. `users` carries no name of its own, so the only name a staff
          // account can have comes from the DoctorProfile that owns it. Joined
          // here so a picker can label a clinician by name; absent for every
          // other account, which is a fact about the data model rather than a
          // gap to paper over.
          doctorProfile: {
            select: {
              fullName: true,
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

  /**
   * The row the offboarding action decides on (P16-T41): the state it needs
   * and nothing a super admin should not see on the way — no password hash.
   */
  async findUserForOffboarding(id: string) {
    return this.prisma.findUniqueActive(this.prisma.user, {
      where: { id },
      select: {
        id: true,
        email: true,
        isActive: true,
        isSystem: true,
        offboardedAt: true,
        roles: {
          where: { deletedAt: null },
          select: { role: { select: { code: true } } },
        },
      },
    });
  }

  async markOffboarded(userId: string, offboardedAt: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { offboardedAt } });
  }

  /**
   * Re-onboarding clears the state and every notice with it, so a person
   * offboarded again a year later is warned again rather than silently
   * skipped because the seven-day row already exists.
   */
  async clearOffboarded(userId: string): Promise<void> {
    await this.prisma.executeTransaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { offboardedAt: null } });
      await tx.userOffboardingNotice.deleteMany({ where: { userId } });
    });
  }

  /**
   * Everyone currently in a window, for the sweep. Deliberately not filtered
   * on `isActive`: a person deactivated mid-window is locked out, but the
   * date they were promised still arrives and their documents still leave.
   */
  async listOffboardedUsers(): Promise<OffboardedUserRecord[]> {
    const rows = await this.prisma.findManyActive(this.prisma.user, {
      where: { offboardedAt: { not: null } },
      select: {
        id: true,
        email: true,
        isActive: true,
        offboardedAt: true,
        roles: { where: { deletedAt: null }, select: { role: { select: { code: true } } } },
      },
      orderBy: { offboardedAt: 'asc' },
    });
    return rows.flatMap((row) =>
      row.offboardedAt === null
        ? []
        : [
            {
              id: row.id,
              email: row.email,
              isActive: row.isActive,
              offboardedAt: row.offboardedAt,
              roleCodes: row.roles.map((userRole) => userRole.role.code),
            },
          ],
    );
  }

  /**
   * Claims one notice threshold for one person, and reports whether this
   * call was the one that claimed it. `skipDuplicates` makes the unique index
   * the arbiter, so two sweeps racing cannot both send the reminder or both
   * run the purge — the same shape as the vault and licence expiry notices.
   */
  async claimOffboardingNotice(userId: string, thresholdDays: number): Promise<boolean> {
    const result = await this.prisma.userOffboardingNotice.createMany({
      data: [{ userId, thresholdDays }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }
}
