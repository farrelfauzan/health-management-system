import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { MfaRouteOptions } from './mfa-route-options.type';
import { MfaTicketGuard } from './mfa-ticket.guard';
import { PublicRoute } from '../authorization/public-route.decorator';

export const MFA_ROUTE_KEY = 'mfa_route';

/**
 * Declares a route that authenticates itself (SJ-8).
 *
 * The three MFA endpoints sit outside the ordinary permission model because
 * they are the machinery that *decides* whether an ordinary session exists
 * yet. `@PublicRoute(true)` stands the global JWT and permission guards down —
 * they would reject a caller holding only a ticket — and `MfaTicketGuard`
 * takes over, so the route is never actually unauthenticated.
 *
 * Bundling all three decorators into one is the point: a future route that
 * marks itself public and forgets the guard is a route with no authentication
 * at all, and this makes that mistake require deliberate effort. The
 * route-guard coverage spec holds the other end, asserting that every public
 * route in the auth controller carries this metadata.
 */
export function MfaRoute(options: MfaRouteOptions): MethodDecorator {
  return applyDecorators(
    PublicRoute(true),
    SetMetadata(MFA_ROUTE_KEY, options),
    UseGuards(MfaTicketGuard),
  );
}
