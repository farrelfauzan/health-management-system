import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { MfaTicketService } from '../../modules/auth/service/mfa-ticket.service';
import { JwtSecretsService } from '../config/jwt-secrets.service';
import { verifyWithAnySecret } from '../config/verify-with-any-secret';
import { CurrentUser } from './current-user.type';
import { MfaActor } from './mfa-actor.type';
import { MfaRouteOptions } from './mfa-route-options.type';
import { MFA_ROUTE_KEY } from './mfa-route.decorator';

const BEARER_PREFIX = 'Bearer ';

/**
 * Authenticates the MFA routes, which the global guards deliberately skip
 * (SJ-8).
 *
 * One header, two acceptable credentials, and the route decides which. An
 * access token means "already signed in, adding or replacing a factor"; a
 * ticket means "password checked, nothing granted yet". They cannot be
 * confused because they are signed with different keys — see
 * {@link MfaTicketService} — so this guard is choosing between two
 * cryptographic outcomes, not trusting a field in a payload.
 *
 * The access-token branch is tried first only because it is the common case.
 * Order carries no security weight here: a ticket cannot verify as an access
 * token however many times it is tried.
 */
@Injectable()
export class MfaTicketGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly jwtSecrets: JwtSecretsService,
    private readonly mfaTickets: MfaTicketService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<MfaRouteOptions | undefined>(MFA_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // A route reaching this guard without the metadata has lost its
    // declaration somehow. Denying is the only safe reading: the alternative
    // is guessing which credential an undeclared route wanted.
    if (!options) {
      throw new UnauthorizedException('Route is missing its MFA credential declaration');
    }
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      mfaActor?: MfaActor;
    }>();
    const credential = readBearerCredential(request.headers.authorization);
    if (!credential) {
      throw new UnauthorizedException('Missing bearer credential');
    }
    request.mfaActor = await this.resolveActor(credential, options);
    return true;
  }

  private async resolveActor(credential: string, options: MfaRouteOptions): Promise<MfaActor> {
    if (options.allowAccessToken) {
      const userId = await this.tryReadAccessTokenSubject(credential);
      if (userId) {
        return { userId, viaTicket: false };
      }
    }
    const claims = await this.mfaTickets.verifyTicket(credential, options.purpose);
    return { userId: claims.sub, viaTicket: true };
  }

  /** Null rather than throwing: a failure here just means "try the ticket". */
  private async tryReadAccessTokenSubject(token: string): Promise<string | null> {
    try {
      const payload = await verifyWithAnySecret<CurrentUser>(
        this.jwtService,
        token,
        this.jwtSecrets.getAccessVerificationSecrets(),
      );
      return payload.sub || null;
    } catch {
      return null;
    }
  }
}

function readBearerCredential(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const credential = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return credential.length > 0 ? credential : null;
}
