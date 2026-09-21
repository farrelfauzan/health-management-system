export type ListAuditEventsParams = {
  page: number;
  limit: number;
  patientId?: string;
  actorUserId?: string;
  resource?: string;
  action?: string;
  requestId?: string;
  occurredFrom?: string;
  occurredTo?: string;
};

export type AuditEventRecord = {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  patientId: string | null;
  ipAddress: string | null;
  requestId: string | null;
  metadata: unknown;
  occurredAt: Date;
};

export type ListAuditEventsRecords = {
  records: AuditEventRecord[];
  total: number;
};

/**
 * The display name of one account that appears as an audit actor, looked up
 * for a whole page of rows at once (P20-T07).
 */
export type AuditActorNameRecord = {
  id: string;
  name: string;
};
