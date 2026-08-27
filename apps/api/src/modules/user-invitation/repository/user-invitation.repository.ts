import {
  CreateUserInvitationRecord,
  ListUserInvitationsParams,
  RotateUserInvitationTokenRecord,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

const INVITATION_INCLUDE = {
  invitedBy: {
    select: {
      email: true,
    },
  },
} as const;

@Injectable()
export class UserInvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Display names for role codes, for rendering an invitation. Separate from
   * `AdminManagementRepository.findActiveRolesByCodes`, which answers the
   * validation question ("do these all exist") and selects only ids — a
   * pending invitation names roles it has not granted yet, so the two lookups
   * genuinely want different columns.
   */
  async findRoleNamesByCodes(roleCodes: string[]): Promise<Map<string, string>> {
    if (roleCodes.length === 0) {
      return new Map();
    }
    const roles = await this.prisma.findManyActive(this.prisma.role, {
      where: { code: { in: roleCodes } },
      select: { code: true, name: true },
    });
    return new Map(roles.map((role) => [role.code, role.name]));
  }

  async createInvitation(payload: CreateUserInvitationRecord) {
    return this.prisma.userInvitation.create({
      data: {
        email: payload.email,
        tokenHash: payload.tokenHash,
        roleCodes: payload.roleCodes,
        invitedById: payload.invitedById,
        expiresAt: payload.expiresAt,
      },
      include: INVITATION_INCLUDE,
    });
  }

  async findInvitationById(id: string) {
    return this.prisma.userInvitation.findUnique({
      where: { id },
      include: INVITATION_INCLUDE,
    });
  }

  async findInvitationByTokenHash(tokenHash: string) {
    return this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: INVITATION_INCLUDE,
    });
  }

  /**
   * Live invitations for one address — not yet accepted, not withdrawn, not
   * lapsed. Used to refuse a second invitation to a mailbox that already has
   * one outstanding, so two valid links for the same person never exist.
   */
  async findLiveInvitationByEmail(email: string, now: Date) {
    return this.prisma.userInvitation.findFirst({
      where: {
        email,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: INVITATION_INCLUDE,
    });
  }

  async listInvitations(params: ListUserInvitationsParams, now: Date) {
    const skip = (params.page - 1) * params.limit;
    const where = buildStatusWhere(params, now);
    const [items, total] = await this.prisma.executeTransaction(async (tx) => {
      const rows = await tx.userInvitation.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: INVITATION_INCLUDE,
      });
      const count = await tx.userInvitation.count({ where });
      return [rows, count] as const;
    });
    return { items, total, page: params.page, limit: params.limit };
  }

  async revokeInvitation(id: string, revokedAt: Date) {
    return this.prisma.userInvitation.update({
      where: { id },
      data: { revokedAt },
      include: INVITATION_INCLUDE,
    });
  }

  /**
   * A resend is a replacement, not an edit: the old row is revoked and a new
   * one is written in the same transaction. Rotating the hash in place would
   * leave no record that an earlier link ever existed, and the audit question
   * after a leak is "how many links were minted for this address, and when" —
   * which only separate rows can answer.
   */
  async replaceInvitation(payload: RotateUserInvitationTokenRecord, revokedAt: Date) {
    return this.prisma.executeTransaction(async (tx) => {
      const previous = await tx.userInvitation.update({
        where: { id: payload.invitationId },
        data: { revokedAt },
      });
      return tx.userInvitation.create({
        data: {
          email: previous.email,
          tokenHash: payload.tokenHash,
          roleCodes: previous.roleCodes,
          invitedById: previous.invitedById,
          expiresAt: payload.expiresAt,
        },
        include: INVITATION_INCLUDE,
      });
    });
  }

  /**
   * Consumes the invitation and creates the account in one transaction.
   *
   * They cannot be separate calls. A crash between them either activates a
   * user nobody can prove was invited, or burns an invitation without creating
   * the account it was for — and the second leaves the invitee locked out with
   * a dead link and no way to say so.
   */
  async acceptInvitation(payload: {
    invitationId: string;
    email: string;
    passwordHash: string;
    roleIds: string[];
    assignedById: string;
    consumedAt: Date;
  }) {
    return this.prisma.executeTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: payload.email,
          passwordHash: payload.passwordHash,
          isActive: true,
        },
        select: { id: true, email: true },
      });
      await tx.userRole.createMany({
        data: payload.roleIds.map((roleId) => ({
          userId: user.id,
          roleId,
          assignedById: payload.assignedById,
        })),
      });
      await tx.userInvitation.update({
        where: { id: payload.invitationId },
        data: { consumedAt: payload.consumedAt },
      });
      return user;
    });
  }
}

function buildStatusWhere(params: ListUserInvitationsParams, now: Date) {
  switch (params.status) {
    case 'PENDING':
      return { consumedAt: null, revokedAt: null, expiresAt: { gt: now } };
    case 'ACCEPTED':
      return { consumedAt: { not: null } };
    case 'REVOKED':
      return { consumedAt: null, revokedAt: { not: null } };
    case 'EXPIRED':
      return { consumedAt: null, revokedAt: null, expiresAt: { lte: now } };
    default:
      return {};
  }
}
