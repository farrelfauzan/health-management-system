import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { LoginResult, MfaEnrolmentCompleted, SessionHeartbeat } from '@hms/shared-types';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { MfaCaller } from '../../../common/auth/mfa-actor.decorator';
import { MfaActor } from '../../../common/auth/mfa-actor.type';
import { MfaRoute } from '../../../common/auth/mfa-route.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { MfaChallengeDto } from '../dto/mfa-challenge.dto';
import { MfaRegenerateRecoveryCodesDto } from '../dto/mfa-regenerate-recovery-codes.dto';
import { MfaResetDto } from '../dto/mfa-reset.dto';
import { MfaVerifyEnrolmentDto } from '../dto/mfa-verify-enrolment.dto';
import { MfaService } from '../service/mfa.service';
import { MfaTicketService } from '../service/mfa-ticket.service';
import { RefreshTokenCookieCarrier, RefreshTokenCookieWriter } from '../auth.types';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
} from './refresh-token-cookie';
import { FeatureAvailabilityCacheService } from '../../feature-entitlement/service/feature-availability-cache.service';
import { clearSessionHintCookie, setSessionHintCookie } from './session-hint-cookie';
import { RequestOrigin } from '../../../common/observability/request-context.decorator';
import { RequestContext } from '../../../common/observability/observability.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { LoginDto } from '../dto/login.dto';
import { AuthService } from '../service/auth.service';

@ApiTags('Auth')
@Controller({
  version: '1',
  path: 'auth',
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly mfaTickets: MfaTicketService,
    private readonly featureAvailabilityCache: FeatureAvailabilityCacheService,
  ) {}

  /**
   * The disabled feature keys stamped into every session hint (IMP-9), so the
   * Next.js shell can drop a feature's nav entries before it renders rather
   * than after hydration. Reads the guard's own cache, so this costs a `Set`
   * copy on a path that already does password hashing.
   */
  private async resolveDisabledFeatures(): Promise<readonly string[]> {
    return this.featureAvailabilityCache.getDisabledKeys();
  }

  @Post('login')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Log in with email and password',
    responseDescription:
      'One of three outcomes (SJ-8). `AUTHENTICATED` carries `tokens`; `MFA_REQUIRED` and `MFA_ENROLMENT_REQUIRED` carry a short-lived `mfaTicket` instead, and no session cookie is written. Branch on `status` — a client that reaches straight for `tokens` will break the moment an account becomes privileged.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.loginResult,
      message: 'Login success',
    },
    requestType: LoginDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.loginRequest,
    isPublic: true,
    unauthorizedDescription: 'Invalid credentials.',
  })
  async login(
    @Body() payload: LoginDto,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    const outcome = await this.authService.login(payload, origin);
    if (outcome.kind === 'MFA_TICKET') {
      // No cookies. A half-authenticated caller must not leave with a refresh
      // token, and must not leave with a session hint either — the hint drives
      // what the frontend renders, and rendering a signed-in shell for someone
      // who has not passed their second factor is how a stalled challenge turns
      // into an apparently working session.
      return {
        data: {
          status: outcome.status,
          mfaTicket: { ticket: outcome.ticket, expiresIn: outcome.expiresIn },
        } satisfies LoginResult,
        message: 'Second factor required',
      };
    }
    const { session } = outcome;
    setRefreshTokenCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
    setSessionHintCookie(response, {
      roles: session.roles,
      permissions: session.permissions,
      disabledFeatures: await this.resolveDisabledFeatures(),
      expiresAt: session.sessionExpiresAt,
    });

    return {
      data: {
        status: 'AUTHENTICATED',
        tokens: session.tokens,
        ...(outcome.enrolmentRequired ? { mfaEnrolmentRequired: true } : {}),
        ...(outcome.enrolmentDeadline
          ? { mfaEnrolmentDeadline: outcome.enrolmentDeadline.toISOString() }
          : {}),
      } satisfies LoginResult,
      message: 'Login success',
    };
  }

  @Post('refresh')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Rotate the refresh token',
    responseDescription:
      'A new access token. The rotated refresh token is returned only as an httpOnly cookie, never in the body — the request carries no payload, because the browser attaches the cookie itself.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.tokens,
      message: 'Token refreshed',
    },
    isPublic: true,
    unauthorizedDescription: 'Invalid refresh token.',
  })
  async refresh(
    @Req() request: RefreshTokenCookieCarrier,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    const refreshToken = readRefreshTokenCookie(request);
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const session = await this.authService.refresh(refreshToken, origin);
    setRefreshTokenCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
    setSessionHintCookie(response, {
      roles: session.roles,
      permissions: session.permissions,
      disabledFeatures: await this.resolveDisabledFeatures(),
      expiresAt: session.sessionExpiresAt,
    });

    return {
      data: session.tokens,
      message: 'Token refreshed',
    };
  }

  @Post('logout')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Log out and revoke the refresh token family',
    responseDescription:
      'The refresh-token family behind the request cookie is revoked and the cookie is cleared. Succeeds even when the cookie is absent or unrecognised, so the endpoint cannot be used to probe which tokens are real.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.logoutResult,
      message: 'Logout success',
    },
    isPublic: true,
    unauthorizedDescription: 'Invalid refresh token.',
  })
  async logout(
    @Req() request: RefreshTokenCookieCarrier,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    const refreshToken = readRefreshTokenCookie(request);
    // The cookie is cleared whether or not the server recognised the token:
    // the client asked to end its session, and leaving a dead cookie behind
    // only guarantees the next request fails in a more confusing way.
    clearRefreshTokenCookie(response);
    clearSessionHintCookie(response);
    const result = refreshToken
      ? await this.authService.logout(refreshToken, origin)
      : { success: true, message: 'Logged out' };

    return {
      data: result,
      message: 'Logout success',
    };
  }

  @Post('logout-all')
  @Auth([{ action: 'logout', subject: 'Auth' }])
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Revoke every session for the current user',
    responseDescription:
      'All refresh-token families for the authenticated user are revoked. Every other device is signed out at its next refresh.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.logoutResult,
      message: 'All sessions revoked',
    },
  })
  async logoutAll(
    @AuthUser() currentUser: CurrentUser,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    clearRefreshTokenCookie(response);
    clearSessionHintCookie(response);
    const result = await this.authService.revokeAllSessions(currentUser.sub, origin);

    return {
      data: result,
      message: 'All sessions revoked',
    };
  }

  @Post('session/heartbeat')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Report that the session is still in use',
    responseDescription:
      'Marks the session as active without rotating it, and returns the thresholds the browser should count down to. Authenticated by the refresh cookie alone, like /auth/refresh. Cannot revive a session that has already timed out — `alive: false` says so rather than failing, because a heartbeat is advisory and the next real request will discover it anyway.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.sessionHeartbeat,
      message: 'Session activity recorded',
    },
    isPublic: true,
  })
  async recordSessionActivity(@Req() request: RefreshTokenCookieCarrier) {
    const refreshToken = readRefreshTokenCookie(request);
    const alive = refreshToken
      ? await this.authService.recordSessionActivity(refreshToken)
      : false;

    return {
      data: {
        alive,
        idleTimeoutSeconds: this.authService.idleTimeoutSeconds,
        warningLeadSeconds: this.authService.warningLeadSeconds,
      } satisfies SessionHeartbeat,
      message: 'Session activity recorded',
    };
  }

  @Post('session/lock')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Hand the workstation over',
    responseDescription:
      'Revokes the refresh-token family and clears the cookies, exactly as logout does. Separate from /auth/logout only in the audit trail: a deliberate hand-off is recorded as SESSION_LOCK so a clinic can tell whether staff actually lock terminals when they walk away.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.logoutResult,
      message: 'Session locked',
    },
    isPublic: true,
  })
  async lockSession(
    @Req() request: RefreshTokenCookieCarrier,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    const refreshToken = readRefreshTokenCookie(request);
    clearRefreshTokenCookie(response);
    clearSessionHintCookie(response);
    const result = refreshToken
      ? await this.authService.lockSession(refreshToken, origin)
      : { success: true, message: 'Logged out' };

    return {
      data: result,
      message: 'Session locked',
    };
  }

  @Post('mfa/enroll')
  @MfaRoute({ purpose: 'mfa_enrolment', allowAccessToken: true })
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Begin TOTP enrolment',
    responseDescription:
      'A fresh secret, stored encrypted and unverified. Render `otpauthUri` as a QR code and offer `secret` for manual entry — both carry the same value, and a QR alone is unusable with a screen reader or a desktop authenticator. Nothing is enforced until the code is verified. Authenticate with either an access token or an enrolment ticket from login.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.mfaEnrolment,
      message: 'Enrolment started',
    },
    isPublic: true,
    unauthorizedDescription: 'Missing or invalid access token or enrolment ticket.',
  })
  async beginMfaEnrolment(@MfaCaller() actor: MfaActor) {
    return {
      data: await this.mfaService.beginEnrolment(actor),
      message: 'Enrolment started',
    };
  }

  @Post('mfa/verify')
  @MfaRoute({ purpose: 'mfa_enrolment', allowAccessToken: true })
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Activate TOTP enrolment with a code',
    responseDescription:
      'Activates enforcement and returns ten recovery codes **once** — only their hashes are kept, so a client that fails to show them has cost the user their fallback. When enrolment was reached with an enrolment ticket the response also completes the login and sets the session cookies.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.mfaEnrolmentCompleted,
      message: 'Second factor enrolled',
    },
    requestType: MfaVerifyEnrolmentDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.mfaVerifyRequest,
    isPublic: true,
    unauthorizedDescription: 'The code was not valid.',
  })
  async verifyMfaEnrolment(
    @MfaCaller() actor: MfaActor,
    @Body() payload: MfaVerifyEnrolmentDto,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    const { recoveryCodes } = await this.mfaService.completeEnrolment(actor, payload.code, origin);
    if (!actor.viaTicket) {
      return {
        data: { recoveryCodes } satisfies MfaEnrolmentCompleted,
        message: 'Second factor enrolled',
      };
    }
    // Forced enrolment: this caller has no session to go back to, and has just
    // proved both factors in the same exchange. Sending them to the login form
    // again would be theatre.
    const session = await this.authService.issueSessionForVerifiedUser(actor.userId, origin);
    setRefreshTokenCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
    setSessionHintCookie(response, {
      roles: session.roles,
      permissions: session.permissions,
      disabledFeatures: await this.resolveDisabledFeatures(),
      expiresAt: session.sessionExpiresAt,
    });

    return {
      data: { recoveryCodes, tokens: session.tokens } satisfies MfaEnrolmentCompleted,
      message: 'Second factor enrolled',
    };
  }

  @Post('mfa/challenge')
  @MfaRoute({ purpose: 'mfa_challenge', allowAccessToken: false })
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Complete a two-phase login with a second factor',
    responseDescription:
      'Trades the challenge ticket for a real session. Send exactly one of `code` or `recoveryCode` — a body carrying both is rejected rather than the server choosing which to spend.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.tokens,
      message: 'Login success',
    },
    requestType: MfaChallengeDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.mfaChallengeRequest,
    isPublic: true,
    unauthorizedDescription: 'Verification failed, or the ticket has expired.',
  })
  async answerMfaChallenge(
    @MfaCaller() actor: MfaActor,
    @Body() payload: MfaChallengeDto,
    @RequestOrigin() origin: RequestContext,
    @Res({ passthrough: true }) response: RefreshTokenCookieWriter,
  ) {
    const verifiedUserId = await this.mfaService.answerChallenge(actor.userId, payload, origin);
    const session = await this.authService.issueSessionForVerifiedUser(verifiedUserId, origin);
    setRefreshTokenCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
    setSessionHintCookie(response, {
      roles: session.roles,
      permissions: session.permissions,
      disabledFeatures: await this.resolveDisabledFeatures(),
      expiresAt: session.sessionExpiresAt,
    });

    return {
      data: session.tokens,
      message: 'Login success',
    };
  }

  @Get('mfa/status')
  @Auth([{ action: 'logout', subject: 'Auth' }])
  @ApiEndpoint({
    summary: 'Read the current user’s second-factor status',
    responseDescription:
      'Whether a second factor is enrolled, whether this account requires one, and how many recovery codes remain. Drives the settings screen and the grace-period banner.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.mfaStatus,
      message: 'MFA status',
    },
  })
  async getMfaStatus(@AuthUser() currentUser: CurrentUser) {
    return {
      data: await this.mfaService.getStatus(currentUser.sub),
      message: 'MFA status',
    };
  }

  @Post('mfa/recovery-codes')
  @Auth([{ action: 'logout', subject: 'Auth' }])
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Regenerate recovery codes',
    responseDescription:
      'Issues ten fresh codes and invalidates every prior one. Requires a current authenticator code even though the caller is signed in: this endpoint mints durable bypasses for the second factor, so a borrowed unlocked workstation must not be enough to reach it.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.mfaRecoveryCodes,
      message: 'Recovery codes regenerated',
    },
    requestType: MfaRegenerateRecoveryCodesDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.mfaVerifyRequest,
    unauthorizedDescription: 'The code was not valid.',
  })
  async regenerateRecoveryCodes(
    @AuthUser() currentUser: CurrentUser,
    @Body() payload: MfaRegenerateRecoveryCodesDto,
    @RequestOrigin() origin: RequestContext,
  ) {
    return {
      data: await this.mfaService.regenerateRecoveryCodes(currentUser.sub, payload.code, origin),
      message: 'Recovery codes regenerated',
    };
  }

  @Post('mfa/reset')
  @Auth([{ action: 'update', subject: 'User' }])
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Remove another user’s second factor',
    responseDescription:
      'The lost-device path. Requires the acting administrator’s own current code, revokes every session the target holds, and is audited as MFA_RESET with the stated reason — this is the one action that downgrades another account to a password.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.mfaResetResult,
      message: 'Second factor reset',
    },
    requestType: MfaResetDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.mfaResetRequest,
    unauthorizedDescription: 'The administrator’s own code was not valid.',
  })
  async resetMfa(
    @AuthUser() currentUser: CurrentUser,
    @Body() payload: MfaResetDto,
    @RequestOrigin() origin: RequestContext,
  ) {
    await this.mfaService.resetForUser(currentUser.sub, payload, origin);

    return {
      data: { success: true, message: 'Second factor reset' },
      message: 'Second factor reset',
    };
  }
}
