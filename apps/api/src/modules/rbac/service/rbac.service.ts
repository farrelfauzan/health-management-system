import { Injectable } from '@nestjs/common';

import { RbacRepository } from '../repository/rbac.repository';

@Injectable()
export class RbacService {
  constructor(private readonly rbacRepository: RbacRepository) {}

  async getRoles() {
    return this.rbacRepository.findActiveRoles();
  }

  async assignRole(userId: string, roleCode: string, assignedById: string) {
    return this.rbacRepository.assignRole(userId, roleCode, assignedById);
  }

  async unassignRole(userId: string, roleCode: string, unassignedById: string) {
    return this.rbacRepository.unassignRole(userId, roleCode, unassignedById);
  }
}
