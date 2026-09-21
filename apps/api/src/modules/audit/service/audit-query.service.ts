import {
  AuditEventRecord,
  AuditEventResponse,
  ListAuditEventsParams,
  ListAuditEventsResult,
} from '@hms/shared-types';
import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditAction } from '../../../generated/prisma/client';
import { AuditQueryRepository } from '../repository/audit-query.repository';

const AUDIT_ACTIONS: readonly string[] = Object.values(AuditAction);

/**
 * Reads the append-only access history (SJ-4). There is no write path here on
 * purpose: rows are produced by `AuditInterceptor` and by services recording
 * business events, and this module only answers questions about them.
 */
@Injectable()
export class AuditQueryService {
  constructor(private readonly auditQueryRepository: AuditQueryRepository) {}

  async listAuditEvents(params: ListAuditEventsParams): Promise<ListAuditEventsResult> {
    assertKnownAction(params.action);
    const { records, total } = await this.auditQueryRepository.listAuditEvents(params);
    const actorNames = await this.findActorNames(records);
    return {
      data: records.map((record) => toAuditEventResponse(record, actorNames)),
      meta: { page: params.page, limit: params.limit, total },
    };
  }

  /**
   * One lookup for the whole page, keyed by account id (P20-T07). A page of
   * fifty reads by the same nurse is one id, not fifty queries.
   */
  private async findActorNames(
    records: readonly AuditEventRecord[],
  ): Promise<ReadonlyMap<string, string>> {
    const actorUserIds = [
      ...new Set(
        records
          .map((record) => record.actorUserId)
          .filter((actorUserId): actorUserId is string => actorUserId !== null),
      ),
    ];
    const names = await this.auditQueryRepository.listActorNames(actorUserIds);
    return new Map(names.map((entry) => [entry.id, entry.name]));
  }
}

/**
 * Rejects an unknown action rather than letting Prisma fail on the enum cast,
 * which would surface as a 500 and tell the caller nothing about which of
 * their filters was wrong.
 */
function assertKnownAction(action: string | undefined): void {
  if (action !== undefined && !AUDIT_ACTIONS.includes(action)) {
    throw new BadRequestException(`Unknown audit action: ${action}`);
  }
}

function toAuditEventResponse(
  record: AuditEventRecord,
  actorNames: ReadonlyMap<string, string>,
): AuditEventResponse {
  const actorName = record.actorUserId ? actorNames.get(record.actorUserId) : undefined;
  return {
    id: record.id,
    ...(record.actorUserId ? { actorUserId: record.actorUserId } : {}),
    ...(actorName ? { actorName } : {}),
    ...(record.actorRole ? { actorRole: record.actorRole } : {}),
    action: record.action,
    resource: record.resource,
    ...(record.resourceId ? { resourceId: record.resourceId } : {}),
    ...(record.patientId ? { patientId: record.patientId } : {}),
    ...(record.ipAddress ? { ipAddress: record.ipAddress } : {}),
    ...(record.requestId ? { requestId: record.requestId } : {}),
    ...(isMetadataObject(record.metadata) ? { metadata: record.metadata } : {}),
    occurredAt: record.occurredAt.toISOString(),
  };
}

function isMetadataObject(metadata: unknown): metadata is Record<string, unknown> {
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata);
}
