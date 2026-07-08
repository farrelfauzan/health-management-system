import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { AuthService } from '../service/auth.service';

@Controller({
  version: '1',
  path: 'auth',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @PublicRoute(true)
  @HttpCode(200)
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
  async logout(@Body() payload: LogoutDto) {
    const result = await this.authService.logout(payload.refreshToken);

    return {
      data: result,
      message: 'Logout success',
    };
  }
}
