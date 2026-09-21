/**
 * One audit row as the access-history endpoint returns it (SJ-4).
 *
 * `metadata` is deliberately narrow — the HTTP method and the matched route
 * pattern, never a concrete URL. A query string can carry a patient's name
 * from a search box, and this response is read by administrators who may have
 * no clinical grant at all.
 *
 * `actorName` sits beside `actorUserId`, never in place of it (P20-T07): the id
 * is the stable key a reviewer filters on, the name is what they read. It is
 * resolved when the log is read, not stored on the row, so it is the account's
 * current name. Absent when there is no actor, or when the account no longer
 * exists — the log keeps the id of a deleted user on purpose.
 */
export type AuditEventResponse = {
  id: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
};

export type ListAuditEventsMeta = {
  page: number;
  limit: number;
  total: number;
};

export type ListAuditEventsResult = {
  data: AuditEventResponse[];
  meta: ListAuditEventsMeta;
};
