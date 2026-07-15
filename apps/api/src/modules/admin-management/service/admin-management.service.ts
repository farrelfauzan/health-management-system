import { hash } from 'bcryptjs';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateAdminUserDto } from '../dto/update-admin-user.dto';
import { AdminManagementRepository } from '../repository/admin-management.repository';

@Injectable()
export class AdminManagementService {
  constructor(private readonly adminManagementRepository: AdminManagementRepository) {}

  async listUsers(query: ListUsersQueryDto) {
    const result = await this.adminManagementRepository.listUsers(query);

    return {
      items: result.items.map((user) => ({
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        roles: user.roles.map((userRole) => ({
          code: userRole.role.code,
          name: userRole.role.name,
        })),
      })),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async createAdminUser(payload: CreateAdminUserDto, currentUserId: string) {
    const existingUser = await this.adminManagementRepository.findActiveUserByEmail(payload.email);

    if (existingUser) {
      throw new ConflictException('User email already exists');
    }

    const roles = await this.adminManagementRepository.findActiveRolesByCodes(payload.roleCodes);

    if (roles.length !== payload.roleCodes.length) {
      throw new BadRequestException('One or more role codes are invalid');
    }

    const passwordHash = await hash(payload.password, 10);

    const createdUser = await this.adminManagementRepository.createUserWithRoles({
      email: payload.email,
      passwordHash,
      isActive: payload.isActive,
      roleIds: roles.map((role) => role.id),
      assignedById: currentUserId,
    });

    if (!createdUser) {
      throw new NotFoundException('Created user not found');
    }

    return {
      id: createdUser.id,
      email: createdUser.email,
      isActive: createdUser.isActive,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
      roles: createdUser.roles.map((userRole) => ({
        code: userRole.role.code,
        name: userRole.role.name,
      })),
    };
  }

  async updateAdminUser(id: string, payload: UpdateAdminUserDto, currentUserId: string) {
    const user = await this.adminManagementRepository.findActiveUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (payload.email && payload.email !== user.email) {
      const existingUser = await this.adminManagementRepository.findActiveUserByEmail(payload.email);

      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('User email already exists');
      }
    }

    let nextRoleIds: string[] | undefined;

    if (payload.roleCodes) {
      const roles = await this.adminManagementRepository.findActiveRolesByCodes(payload.roleCodes);

      if (roles.length !== payload.roleCodes.length) {
        throw new BadRequestException('One or more role codes are invalid');
      }

      nextRoleIds = roles.map((role) => role.id);
    }

    const passwordHash = payload.password ? await hash(payload.password, 10) : undefined;

    const updatedUser = await this.adminManagementRepository.updateUserWithRoles({
      userId: id,
      email: payload.email,
      passwordHash,
      isActive: payload.isActive,
      roleIds: nextRoleIds,
      updatedById: currentUserId,
    });

    if (!updatedUser) {
      throw new NotFoundException('Updated user not found');
    }

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      isActive: updatedUser.isActive,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      roles: updatedUser.roles.map((userRole) => ({
        code: userRole.role.code,
        name: userRole.role.name,
      })),
    };
  }
}
