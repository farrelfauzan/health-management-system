import {
  ListOrganizationUnitMembersParams,
  OrganizationUnitMemberRecord,
  PagedOrganizationUnitMembers,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

/**
 * `users` carries no name of its own — the only human-readable name a staff
 * account can have lives on the `DoctorProfile` that owns it. So a clinician
 * resolves to a real name and an administrator or pharmacist does not, and the
 * response has to be honest about which it got rather than inventing one from
 * the local part of an email address.
 */
const MEMBER_SELECT = {
  id: true,
  email: true,
  isActive: true,
  organizationUnitId: true,
  doctorProfile: { select: { fullName: true } },
  roles: {
    where: { unassignedAt: null, deletedAt: null },
    select: { role: { select: { code: true } } },
  },
} as const;

type MemberRow = {
  id: string;
  email: string;
  isActive: boolean;
  organizationUnitId: string | null;
  doctorProfile: { fullName: string } | null;
  roles: { role: { code: string } }[];
};

/**
 * Membership reads and writes (SJ-89).
 *
 * Separate from `OrganizationUnitRepository` because it owns a different table:
 * membership lives on `users`, and a repository that reached across both would
 * make "which table does this module write" unanswerable at a glance.
 */
@Injectable()
export class OrganizationUnitMemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(
    params: ListOrganizationUnitMembersParams,
  ): Promise<PagedOrganizationUnitMembers> {
    const { organizationUnitId, page, limit, search } = params;
    const where: Prisma.UserWhereInput = {
      organizationUnitId,
      deletedAt: null,
      ...(search ? { email: { contains: search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await this.prisma.executeTransaction(async (tx) => {
      const members = await tx.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ email: 'asc' }],
        select: MEMBER_SELECT,
      });
      const count = await tx.user.count({ where });
      return [members, count] as const;
    });

    return { items: rows.map((row) => this.toRecord(row)), page, limit, total };
  }

  /** Live accounts only — a soft-deleted user is not assignable. */
  async findLiveMemberById(userId: string): Promise<OrganizationUnitMemberRecord | null> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: MEMBER_SELECT,
    });

    return row ? this.toRecord(row) : null;
  }

  /**
   * Points the user at a unit. An assignment and a reassignment are the same
   * write — the column holds one value — so the service is what distinguishes
   * them for the audit trail.
   */
  async assignMember(userId: string, organizationUnitId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { organizationUnitId },
    });
  }

  async unassignMember(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { organizationUnitId: null },
    });
  }

  private toRecord(row: MemberRow): OrganizationUnitMemberRecord {
    return {
      userId: row.id,
      email: row.email,
      fullName: row.doctorProfile?.fullName ?? null,
      isActive: row.isActive,
      roles: row.roles.map((entry) => entry.role.code),
      organizationUnitId: row.organizationUnitId,
    };
  }
}
