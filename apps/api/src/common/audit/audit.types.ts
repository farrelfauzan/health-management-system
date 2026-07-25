import { AuditAction } from '../../generated/prisma/client';

export type RecordAuditEventInput = {
  readonly action: AuditAction;
  readonly resource: string;
  readonly actorUserId?: string | null;
  readonly resourceId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly requestId?: string;
};
