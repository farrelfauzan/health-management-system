import { Injectable, NestMiddleware } from '@nestjs/common';

import { AuditContextService } from './audit-context.service';
import { NextHandler } from '../observability/observability.types';

/**
 * Opens one audit context per request (SJ-4). Everything downstream — guards,
 * the handler, and the interceptor that writes the row — runs inside it.
 */
@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  constructor(private readonly auditContextService: AuditContextService) {}

  use(_request: unknown, _response: unknown, next: NextHandler): void {
    this.auditContextService.runWithContext(() => next());
  }
}
