import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { AuditedRouteOptions } from './audit.types';
import { AUDITED_ROUTE_KEY } from './audited.decorator';

/**
 * Belt and braces against a browser that has cached the response and a
 * back/forward cache that would otherwise restore the rendered page whole.
 */
const NO_STORE_VALUE = 'no-store, no-cache, must-revalidate, private';

type CacheControlledResponse = {
  setHeader(name: string, value: string): void;
};

/**
 * Marks every patient-data response uncacheable (SJ-9).
 *
 * The scenario is a shared clinic terminal. Someone locks the workstation, the
 * next person sits down and presses the browser's Back button — and without
 * this, the browser serves the previous patient's record out of its own cache.
 * The server is never consulted, so revoking the session did nothing: the data
 * is already on the disk in front of them.
 *
 * Keyed off `@Audited()` rather than a second list of routes. That decorator
 * already means "this route touches patient-identifiable data", it is the
 * thing the route-guard coverage spec enforces on every patient-data
 * controller, and a new route inherits both behaviours from one annotation. A
 * separate list would drift, and the drift would be silent.
 *
 * `Pragma` is sent too. It is HTTP/1.0 and formally obsolete, but proxies in
 * clinic networks are not always modern, and the header costs nothing.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditedRouteOptions | undefined>(
      AUDITED_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options || context.getType() !== 'http') {
      return next.handle();
    }
    // Set before the handler runs, not after: an error response carries the
    // headers too, and a 500 body from a patient route is not something to
    // leave in a cache either.
    const response = context.switchToHttp().getResponse<CacheControlledResponse>();
    response.setHeader('Cache-Control', NO_STORE_VALUE);
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    return next.handle();
  }
}
