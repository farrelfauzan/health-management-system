import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { ClientAddressedRequest, RequestContext } from './observability.types';
import { resolveClientIp } from './resolve-client-ip';

/**
 * The client address and correlation id of the current request, for handlers
 * that need to audit something the `@Audited()` interceptor cannot reach.
 * Keeps raw `@Req()` out of controllers, which is the point of the existing
 * `@AuthUser()` decorator too.
 */
export const RequestOrigin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context
      .switchToHttp()
      .getRequest<ClientAddressedRequest & { requestId?: string }>();
    return {
      ipAddress: resolveClientIp(request),
      requestId: request.requestId ?? null,
    };
  },
);
