import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
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
  async login(@Body() payload: LoginDto) {
    const tokens = await this.authService.login(payload);

    return {
      data: tokens,
      message: 'Login success',
    };
  }

  @Post('refresh')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Rotate a refresh token',
    responseDescription: 'A new access token and rotated refresh token.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.tokens,
      message: 'Token refreshed',
    },
    requestType: RefreshTokenDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.refreshRequest,
    isPublic: true,
    unauthorizedDescription: 'Invalid refresh token.',
  })
  async refresh(@Body() payload: RefreshTokenDto) {
    const token = await this.authService.refresh(payload.refreshToken);

    return {
      data: token,
      message: 'Token refreshed',
    };
  }

  @Post('logout')
  @PublicRoute(true)
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Log out and revoke the refresh token family',
    responseDescription: 'Confirmation that the refresh token family was revoked.',
    responseExample: {
      data: PHASE_THREE_EXAMPLES.auth.logoutResult,
      message: 'Logout success',
    },
    requestType: LogoutDto,
    requestExample: PHASE_THREE_EXAMPLES.auth.logoutRequest,
    isPublic: true,
    unauthorizedDescription: 'Invalid refresh token.',
  })
  async logout(@Body() payload: LogoutDto) {
    const result = await this.authService.logout(payload.refreshToken);

    return {
      data: result,
      message: 'Logout success',
    };
  }
}
