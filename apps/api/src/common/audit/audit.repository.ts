import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordAuditEventInput } from './audit.types';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditLog(input: RecordAuditEventInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        resource: input.resource,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        resourceId: input.resourceId ?? null,
        patientId: input.patientId ?? null,
        ipAddress: input.ipAddress ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonObject | undefined,
        requestId: input.requestId ?? null,
      },
    });
  }
}
