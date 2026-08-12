import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';

import { AuditContextService } from './audit-context.service';
import { AuditedRequest, AuditedRouteOptions, RecordAuditEventInput } from './audit.types';
import { AUDITED_ROUTE_KEY } from './audited.decorator';
import { AuditService } from './audit.service';
import { resolveClientIp } from '../observability/resolve-client-ip';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_ID_PARAM = 'id';

/**
 * Writes one audit row per completed `@Audited()` route (SJ-4).
 *
 * Two design points are load-bearing. The write is awaited *inside* the
 * response stream, so a request whose access could not be recorded fails
 * instead of returning the data — fire-and-forget loses exactly the records an
 * incident review needs, because a process that crashes mid-request is the
 * case you are reviewing. And it runs after the handler resolves, so an id
 * that only exists in the response (a freshly created patient) is still
 * captured.
 *
 * Rejected requests produce no row here: a permission denial is thrown by
 * `PermissionsGuard`, upstream of any interceptor, and is logged by
 * `AllExceptionsFilter`. Alerting on those is SJ-24's surface, not this one.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly auditContextService: AuditContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditedRouteOptions | undefined>(
      AUDITED_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options || context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    return next.handle().pipe(
      concatMap(async (responseBody: unknown) => {
        await this.auditService.recordOrThrow(
          buildAuditEvent(options, request, responseBody, this.auditContextService.getPatientId()),
        );
        return responseBody;
      }),
    );
  }
}

function buildAuditEvent(
  options: AuditedRouteOptions,
  request: AuditedRequest,
  responseBody: unknown,
  contextPatientId: string | null,
): RecordAuditEventInput {
  const resourceId = resolveResourceId(options, request, responseBody);
  return {
    action: options.action,
    resource: options.resource,
    actorUserId: request.user?.sub ?? null,
    actorRole: resolveActorRole(request),
    resourceId,
    patientId: resolvePatientId(options, request, responseBody, resourceId, contextPatientId),
    ipAddress: resolveClientIp(request),
    requestId: request.requestId ?? null,
    metadata: {
      method: request.method,
      // The matched route *pattern*, never the concrete URL: a query string
      // can carry a patient's name from a search box, and this table is read
      // by more people than the records it points at.
      route: request.route?.path ?? null,
    },
  };
}

/** Comma-joined because a user may hold several, and all of them admitted the request. */
function resolveActorRole(request: AuditedRequest): string | null {
  const roles = request.auditActorRoles ?? [];
  return roles.length > 0 ? roles.join(',') : null;
}

function resolveResourceId(
  options: AuditedRouteOptions,
  request: AuditedRequest,
  responseBody: unknown,
): string | null {
  if (options.idParam === null) {
    return null;
  }
  const paramName = options.idParam ?? DEFAULT_ID_PARAM;
  const fromParams = request.params?.[paramName];
  if (typeof fromParams === 'string' && fromParams.length > 0) {
    return fromParams;
  }
  const fromResponse = readPath(responseBody, ['data', 'id']);
  return typeof fromResponse === 'string' ? fromResponse : null;
}

/**
 * The denormalised patient id, taken from the first candidate that is actually
 * a UUID. The filter is not cosmetic: the column is `uuid`, so a route param
 * like `me` or a malformed query value would abort the insert and, because the
 * write is awaited, turn a working endpoint into a 500.
 */
function resolvePatientId(
  options: AuditedRouteOptions,
  request: AuditedRequest,
  responseBody: unknown,
  resourceId: string | null,
  contextPatientId: string | null,
): string | null {
  const candidates = [
    options.patientIdParam ? request.params?.[options.patientIdParam] : undefined,
    options.patientIdQuery ? request.query?.[options.patientIdQuery] : undefined,
    readPath(request.body, ['patientId']),
    readPath(responseBody, ['data', 'patientId']),
    readPath(responseBody, ['data', 'patient', 'id']),
    options.resource === 'patient' ? resourceId : undefined,
    // Last, because a service that resolved the patient while authorising the
    // request is authoritative but not always present.
    contextPatientId,
  ];
  const patientId = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && UUID_PATTERN.test(candidate),
  );
  return patientId ?? null;
}

function readPath(source: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, source);
}
