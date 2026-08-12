import { Global, Module } from '@nestjs/common';

import { JwtSecretsService } from './jwt-secrets.service';

/**
 * Global access to the JWT key material (SJ-5). Global because the guard, the
 * auth service, and the module factories all need the same view of which key
 * signs and which keys still verify — three copies of that logic is how a
 * rotation half-happens.
 */
@Global()
@Module({
  providers: [JwtSecretsService],
  exports: [JwtSecretsService],
})
export class SecurityConfigModule {}
