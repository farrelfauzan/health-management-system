import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { ClientAddressedRequest, RequestContext } from './observability.types';
import { resolveClientIp } from './resolve-client-ip';

/** Truncated because the header is attacker-controlled and unbounded. */
const USER_AGENT_MAX_LENGTH = 256;

/**
 * The client address and correlation id of the current request, for handlers
 * that need to audit something the `@Audited()` interceptor cannot reach.
 * Keeps raw `@Req()` out of controllers, which is the point of the existing
 * `@AuthUser()` decorator too.
 */
export const RequestOrigin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context.switchToHttp().getRequest<
      ClientAddressedRequest & {
        requestId?: string;
        headers?: Record<string, string | string[] | undefined>;
      }
    >();
    const userAgent = request.headers?.['user-agent'];
    return {
      ipAddress: resolveClientIp(request),
      requestId: request.requestId ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
    };
  },
);
