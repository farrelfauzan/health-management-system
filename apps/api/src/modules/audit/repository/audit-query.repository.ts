import {
  AuditActorNameRecord,
  ListAuditEventsParams,
  ListAuditEventsRecords,
  resolveUserDisplayName,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { USER_DISPLAY_NAME_SELECT } from '../../../common/prisma/user-display-name-select';

@Injectable()
export class AuditQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditEvents(params: ListAuditEventsParams): Promise<ListAuditEventsRecords> {
    const where = buildAuditEventWhere(params);
    const skip = (params.page - 1) * params.limit;
    // No `findManyActive` here: `audit_logs` has no `deleted_at`, because a
    // row that could be marked deleted is a row somebody can hide.
    const [records, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { records, total };
  }

  /**
   * Names the accounts behind one page of audit rows in a single query
   * (P20-T07). `actor_user_id` has no foreign key — see the model — so this is
   * a lookup rather than an include, and an id whose account was hard-deleted
   * simply comes back without a name. Soft-deleted accounts are deliberately
   * kept: "who did this" is a question about the past, and a person who has
   * since left the clinic still did it.
   */
  async listActorNames(actorUserIds: readonly string[]): Promise<AuditActorNameRecord[]> {
    if (actorUserIds.length === 0) {
      return [];
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...actorUserIds] } },
      select: { id: true, ...USER_DISPLAY_NAME_SELECT },
    });
    return users.map((user) => ({ id: user.id, name: resolveUserDisplayName(user) }));
  }
}

function buildAuditEventWhere(params: ListAuditEventsParams): Prisma.AuditLogWhereInput {
  return {
    ...(params.patientId ? { patientId: params.patientId } : {}),
    ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
    ...(params.resource ? { resource: params.resource } : {}),
    ...(params.action ? { action: params.action as AuditAction } : {}),
    ...(params.requestId ? { requestId: params.requestId } : {}),
    ...(params.occurredFrom || params.occurredTo
      ? {
          occurredAt: {
            ...(params.occurredFrom ? { gte: new Date(params.occurredFrom) } : {}),
            ...(params.occurredTo ? { lte: new Date(params.occurredTo) } : {}),
          },
        }
      : {}),
  };
}
