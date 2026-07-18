import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveRoles() {
    return this.prisma.findManyActive(this.prisma.role, {
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
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
