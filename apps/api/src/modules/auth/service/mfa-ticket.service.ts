import { createHmac, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { MfaTicketClaims, MfaTicketPurpose } from '@hms/shared-types';

import { JwtSecretsService } from '../../../common/config/jwt-secrets.service';
import { verifyWithAnySecret } from '../../../common/config/verify-with-any-secret';

/**
 * Long enough to open an authenticator app and read a code, short enough that
 * a ticket captured from a proxy log is worthless by the time anyone reads it.
 */
const TICKET_LIFETIME_SECONDS = 120;

/**
 * Domain separation label. Mixed into the signing key so a ticket and an
 * access token can never be confused for one another even though both descend
 * from `JWT_ACCESS_SECRET`.
 */
const TICKET_KEY_LABEL = 'hms:mfa-pending-ticket:v1';

/**
 * Mints and checks the half-authenticated `mfa_pending` ticket a two-phase
 * login hands back (SJ-8).
 *
 * **Why a derived key rather than a claim.** The ticket must not be usable as
 * an access token — that is the entire security property, since `JwtAuthGuard`
 * would happily attach `request.user` from it and `PermissionsGuard` resolves
 * permissions from the database, not the token. A `purpose` claim alone would
 * make that a matter of remembering to check a field. Instead the signing key
 * is `HMAC-SHA256(JWT_ACCESS_SECRET, label)`, so a ticket presented as a
 * bearer token fails *signature verification* — the guard cannot forget.
 *
 * Deriving from the access secret rather than adding `MFA_TICKET_SECRET` keeps
 * the rotation story unchanged: tickets live two minutes, so they follow
 * `JWT_ACCESS_SECRET` through a rotation without a second runbook. Previous
 * keys are accepted on verification for the same reason access tokens are.
 *
 * The `purpose` claim is still checked, as defence in depth against the two
 * ticket kinds being mixed up with each other.
 */
@Injectable()
export class MfaTicketService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtSecrets: JwtSecretsService,
  ) {}

  get ticketLifetimeSeconds(): number {
    return TICKET_LIFETIME_SECONDS;
  }

  async issueTicket(userId: string, purpose: MfaTicketPurpose): Promise<string> {
    const claims: MfaTicketClaims = { sub: userId, purpose, jti: randomUUID() };
    return this.jwtService.signAsync(claims, {
      secret: this.deriveTicketSecret(this.jwtSecrets.getAccessSigningSecret()),
      expiresIn: TICKET_LIFETIME_SECONDS,
    });
  }

  /**
   * Returns the claims, or throws the same refusal for every reason a ticket
   * could be bad — expired, forged, wrong purpose, or an access token
   * presented where a ticket belongs. A caller learning *which* would learn
   * whether the string they hold was ever a real ticket.
   */
  async verifyTicket(ticket: string, expectedPurpose: MfaTicketPurpose): Promise<MfaTicketClaims> {
    const secrets = this.jwtSecrets
      .getAccessVerificationSecrets()
      .map((secret) => this.deriveTicketSecret(secret));
    let claims: MfaTicketClaims;
    try {
      claims = await verifyWithAnySecret<MfaTicketClaims>(this.jwtService, ticket, secrets);
    } catch {
      throw new UnauthorizedException('Invalid or expired verification ticket');
    }
    if (claims.purpose !== expectedPurpose || !claims.sub) {
      throw new UnauthorizedException('Invalid or expired verification ticket');
    }
    return claims;
  }

  private deriveTicketSecret(accessSecret: string): string {
    return createHmac('sha256', accessSecret).update(TICKET_KEY_LABEL).digest('hex');
  }
}
