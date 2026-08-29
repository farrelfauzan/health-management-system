import {
  ListOrganizationUnitMembersQueryInput,
  OrganizationUnitMemberListMeta,
  OrganizationUnitMemberRecord,
  OrganizationUnitMemberResponse,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';
import { OrganizationUnitMemberRepository } from '../repository/organization-unit-member.repository';
import { OrganizationUnitRepository } from '../repository/organization-unit.repository';

const ORGANIZATION_UNIT_MEMBER_AUDIT_RESOURCE = 'organization-unit-member';

/**
 * Who sits in which unit (SJ-89).
 *
 * Deliberately a separate service from `OrganizationUnitService`, mirroring the
 * permission split: maintaining the boxes and deciding who is in them are two
 * jobs, and keeping them in one class would make it easy for a later change to
 * quietly let one grant do the other's work.
 *
 * One unit per person, by construction — `users.organization_unit_id` is a
 * single column, so assigning someone who already sits elsewhere *moves* them.
 * That is the intended behaviour, not a race: the alternative would be to
 * refuse, which would make every reorganisation a two-step unassign/assign for
 * no gain.
 */
@Injectable()
export class OrganizationUnitMemberService {
  constructor(
    private readonly organizationUnitMemberRepository: OrganizationUnitMemberRepository,
    private readonly organizationUnitRepository: OrganizationUnitRepository,
    private readonly auditService: AuditService,
  ) {}

  async listMembers(
    organizationUnitId: string,
    query: ListOrganizationUnitMembersQueryInput,
  ): Promise<{ items: OrganizationUnitMemberResponse[]; meta: OrganizationUnitMemberListMeta }> {
    // Archived units are readable here, unlike on the write paths: the whole
    // point of asking is often "who is still in the unit we just wound down".
    await this.requireUnit(organizationUnitId);
    const result = await this.organizationUnitMemberRepository.listMembers({
      organizationUnitId,
      page: query.page,
      limit: query.limit,
      ...(query.search === undefined ? {} : { search: query.search }),
    });

    return {
      items: result.items.map((member) => this.toResponse(member)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async assignMember(
    organizationUnitId: string,
    userId: string,
    actorUserId: string,
  ): Promise<OrganizationUnitMemberResponse> {
    const unit = await this.organizationUnitRepository.findLiveUnitById(organizationUnitId);
    if (!unit) {
      throw new NotFoundException('Organization unit not found');
    }
    const member = await this.requireLiveMember(userId);
    if (member.organizationUnitId === organizationUnitId) {
      // Not an error worth failing on, but not a silent no-op either: an audit
      // row claiming a move that did not happen is worse than this refusal.
      throw new ConflictException({
        code: 'ORGANIZATION_UNIT_MEMBER_ALREADY_ASSIGNED',
        message: 'This person is already in this unit',
      });
    }
    await this.organizationUnitMemberRepository.assignMember(userId, organizationUnitId);
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_MEMBER_ASSIGNED,
      resource: ORGANIZATION_UNIT_MEMBER_AUDIT_RESOURCE,
      actorUserId,
      resourceId: userId,
      metadata: {
        // The unit they came from is the half nobody looks at until they need
        // it — without it a reassignment reads as an arrival from nowhere.
        before: { organizationUnitId: member.organizationUnitId },
        after: { organizationUnitId },
      },
    });

    return this.toResponse({ ...member, organizationUnitId });
  }

  async unassignMember(
    organizationUnitId: string,
    userId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.requireUnit(organizationUnitId);
    const member = await this.requireLiveMember(userId);
    // Addressed through the unit, so the unit in the URL has to be the one the
    // person is actually in. Otherwise a stale screen could unassign someone
    // from a unit they had already been moved out of.
    if (member.organizationUnitId !== organizationUnitId) {
      throw new ConflictException({
        code: 'ORGANIZATION_UNIT_MEMBER_NOT_IN_UNIT',
        message: 'This person is not a member of this unit',
      });
    }
    await this.organizationUnitMemberRepository.unassignMember(userId);
    await this.auditService.record({
      action: AuditAction.ORGANIZATION_UNIT_MEMBER_UNASSIGNED,
      resource: ORGANIZATION_UNIT_MEMBER_AUDIT_RESOURCE,
      actorUserId,
      resourceId: userId,
      metadata: { before: { organizationUnitId } },
    });
  }

  private async requireUnit(organizationUnitId: string): Promise<void> {
    const unit = await this.organizationUnitRepository.findUnitById(organizationUnitId);
    if (!unit) {
      throw new NotFoundException('Organization unit not found');
    }
  }

  private async requireLiveMember(userId: string): Promise<OrganizationUnitMemberRecord> {
    const member = await this.organizationUnitMemberRepository.findLiveMemberById(userId);
    if (!member) {
      throw new NotFoundException('User not found');
    }
    return member;
  }

  private toResponse(member: OrganizationUnitMemberRecord): OrganizationUnitMemberResponse {
    return {
      userId: member.userId,
      ...(member.fullName ? { fullName: member.fullName } : {}),
      email: member.email,
      isActive: member.isActive,
      roles: member.roles,
    };
  }
}
