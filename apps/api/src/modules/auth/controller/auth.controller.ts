import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { RefreshTokenCookieCarrier, RefreshTokenCookieWriter } from '../auth.types';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
} from './refresh-token-cookie';
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
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Log in with email and password',
    responseDescription: 'Access and refresh tokens for the authenticated user.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.tokens,
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
    const session = await this.authService.login(payload, origin);
    setRefreshTokenCookie(response, session.refreshToken, session.refreshTokenMaxAgeMs);
    setSessionHintCookie(response, { roles: session.roles, expiresAt: session.sessionExpiresAt });

    return {
      data: session.tokens,
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
    setSessionHintCookie(response, { roles: session.roles, expiresAt: session.sessionExpiresAt });

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
}
