import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';

import { NextHandler, ObservedRequest, ObservedResponse } from './observability.types';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns every request a correlation id: honors a well-formed incoming
 * X-Request-Id header, otherwise generates a UUID, and echoes it back on the
 * response so clients and logs can be correlated.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: ObservedRequest, response: ObservedResponse, next: NextHandler): void {
    const incomingId = request.header(REQUEST_ID_HEADER);
    const requestId =
      incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
