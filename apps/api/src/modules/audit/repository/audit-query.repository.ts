import { ListAuditEventsParams, ListAuditEventsRecords } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

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
