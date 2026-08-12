import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtSecretsService } from '../../common/config/jwt-secrets.service';
import { resolveJwtExpiresIn } from '../../common/auth/jwt-expires.util';
import { AuthController } from './controller/auth.controller';
import { AuthRepository } from './repository/auth.repository';
import { AuthService } from './service/auth.service';
import { RefreshTokenCleanupWorker } from './service/refresh-token-cleanup.worker';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService, JwtSecretsService],
      useFactory: (configService: ConfigService, jwtSecrets: JwtSecretsService) => ({
        secret: jwtSecrets.getAccessSigningSecret(),
        signOptions: {
          expiresIn: resolveJwtExpiresIn(configService.get<string>('JWT_ACCESS_EXPIRES_IN'), '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, RefreshTokenCleanupWorker],
  exports: [AuthRepository, AuthService, JwtModule],
})
export class AuthModule {}
