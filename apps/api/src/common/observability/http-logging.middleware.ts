import { Injectable, Logger, NestMiddleware } from '@nestjs/common';

import { NextHandler, ObservedRequest, ObservedResponse } from './observability.types';
import { stripQueryString } from './safe-logging';

const NANOSECONDS_PER_MILLISECOND = 1_000_000;

/**
 * Emits one structured JSON access-log line per request on response finish,
 * covering every outcome including requests rejected by guards before any
 * interceptor runs.
 */
@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpAccess');

  use(request: ObservedRequest, response: ObservedResponse, next: NextHandler): void {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const durationNs = Number(process.hrtime.bigint() - startedAt);
      const line = JSON.stringify({
        requestId: request.requestId,
        method: request.method,
        path: stripQueryString(request.originalUrl),
        statusCode: response.statusCode,
        durationMs: Math.round(durationNs / NANOSECONDS_PER_MILLISECOND),
        userId: request.user?.sub,
      });
      if (response.statusCode >= 500) {
        this.logger.error(line);
      } else if (response.statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });
    next();
  }
}
