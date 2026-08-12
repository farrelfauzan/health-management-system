import { SetMetadata } from '@nestjs/common';

import { AuditedRouteOptions } from './audit.types';

export const AUDITED_ROUTE_KEY = 'audited_route_options_key';

/**
 * Declares that a route touches patient-identifiable data (SJ-4). The row is
 * written by `AuditInterceptor` after the handler resolves; the handler itself
 * stays unaware that it is audited.
 */
export function Audited(options: AuditedRouteOptions): MethodDecorator {
  return SetMetadata(AUDITED_ROUTE_KEY, options);
}
