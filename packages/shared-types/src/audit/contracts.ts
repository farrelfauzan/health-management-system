/**
 * One audit row as the access-history endpoint returns it (SJ-4).
 *
 * `metadata` is deliberately narrow — the HTTP method and the matched route
 * pattern, never a concrete URL. A query string can carry a patient's name
 * from a search box, and this response is read by administrators who may have
 * no clinical grant at all.
 */
export type AuditEventResponse = {
  id: string;
  actorUserId?: string;
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
