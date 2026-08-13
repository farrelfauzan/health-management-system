import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { JwtSecretsService } from '../../common/config/jwt-secrets.service';
import { resolveJwtExpiresIn } from '../../common/auth/jwt-expires.util';
import { MfaTicketGuard } from '../../common/auth/mfa-ticket.guard';
import { AuthController } from './controller/auth.controller';
import { AuthRepository } from './repository/auth.repository';
import { MfaRepository } from './repository/mfa.repository';
import { AuthService } from './service/auth.service';
import { LoginThrottleService } from './service/login-throttle.service';
import { MfaEnforcementService } from './service/mfa-enforcement.service';
import { MfaTicketService } from './service/mfa-ticket.service';
import { SessionPolicyService } from './service/session-policy.service';
import { MfaService } from './service/mfa.service';
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
  providers: [
    AuthRepository,
    MfaRepository,
    AuthService,
    LoginThrottleService,
    MfaEnforcementService,
    MfaTicketService,
    SessionPolicyService,
    MfaService,
    // Resolved by `@MfaRoute()`'s `UseGuards`, which Nest instantiates from
    // this module's injector — so the guard has to be a provider here even
    // though nothing injects it by name.
    MfaTicketGuard,
    RefreshTokenCleanupWorker,
  ],
  exports: [
    AuthRepository,
    AuthService,
    MfaEnforcementService,
    MfaTicketService,
    SessionPolicyService,
    JwtModule,
  ],
})
export class AuthModule {}
