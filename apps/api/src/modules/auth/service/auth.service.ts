import { compare } from 'bcryptjs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { resolveJwtExpiresIn } from '../../../common/auth/jwt-expires.util';
import { LoginDto } from '../dto/login.dto';
import { AuthRepository } from '../repository/auth.repository';
import { JwtPayload } from '../types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(payload: LoginDto) {
    const user = await this.authRepository.findUserByEmail(payload.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await compare(payload.password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const claims: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(claims, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      expiresIn: resolveJwtExpiresIn(this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'), '15m'),
    });
    const refreshToken = await this.jwtService.signAsync(claims, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      expiresIn: resolveJwtExpiresIn(
        this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
        '7d',
      ),
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    };
  }

  async refresh(refreshToken: string) {
    const decoded = await this.verifyRefreshToken(refreshToken);
    const user = await this.authRepository.findUserById(decoded.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const claims: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(claims, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      expiresIn: resolveJwtExpiresIn(this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'), '15m'),
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    };
  }

  async logout(refreshToken: string) {
    await this.verifyRefreshToken(refreshToken);

    return {
      success: true,
      message: 'Logged out',
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
