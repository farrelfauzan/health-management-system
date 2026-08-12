import { AuditAction } from '../../generated/prisma/client';

export type RecordAuditEventInput = {
  readonly action: AuditAction;
  readonly resource: string;
  readonly actorUserId?: string | null;
  readonly actorRole?: string | null;
  readonly resourceId?: string | null;
  readonly patientId?: string | null;
  readonly ipAddress?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly requestId?: string | null;
};

/**
 * What a route declares it touches, read by `AuditInterceptor` (SJ-4).
 *
 * The interceptor resolves ids itself rather than asking each handler to log,
 * because a per-route call is a line a developer can forget and a reviewer
 * cannot see missing. What a route cannot avoid declaring is *which* param
 * carries the patient — that is the one thing no generic rule can infer.
 */
export type AuditedRouteOptions = {
  /** Resource name as it appears in the log, e.g. `patient`, `encounter`. */
  readonly resource: string;
  readonly action: AuditAction;
  /**
   * Route param naming the resource. Defaults to `id`; set it when the handler
   * uses another name (`encounterId`), or to `null` for collection routes that
   * address no single record.
   */
  readonly idParam?: string | null;
  /** Route param carrying the patient id, when the URL names a patient. */
  readonly patientIdParam?: string;
  /** Query key carrying the patient id, for filtered collection routes. */
  readonly patientIdQuery?: string;
};

/**
 * The subset of the HTTP request the interceptor reads. `auditActorRoles` is
 * stamped by `PermissionsGuard`, which has already resolved the actor's roles
 * from the database — reusing them costs nothing and, unlike the JWT claim,
 * reflects the grants that actually admitted the request.
 */
export type AuditedRequest = {
  readonly method: string;
  readonly originalUrl: string;
  readonly params?: Record<string, string | undefined>;
  readonly query?: Record<string, unknown>;
  readonly body?: unknown;
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
  readonly route?: { readonly path?: string };
  readonly requestId?: string;
  readonly user?: { readonly sub?: string };
  readonly auditActorRoles?: readonly string[];
};
