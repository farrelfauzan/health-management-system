import { Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { RbacRepository } from '../repository/rbac.repository';

@Injectable()
export class RbacService {
  constructor(
    private readonly rbacRepository: RbacRepository,
    private readonly auditService: AuditService,
  ) {}

  async getRoles() {
    return this.rbacRepository.findActiveRoles();
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
}
