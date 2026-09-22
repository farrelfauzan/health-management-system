import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { OwnAccountController } from './controller/own-account.controller';
import { OwnAccountRepository } from './repository/own-account.repository';
import { OwnAccountService } from './service/own-account.service';

/**
 * Self-service for the account itself (P20-T05): the name a person carries,
 * separate from every role-shaped profile hanging off it — and, since
 * P24-T15, the NIK they present as a front-desk operator (D-039).
 *
 * Exports the service because the doctor's own-profile route renames through
 * it — one rename rule, whichever screen the doctor started from.
 */
@Module({
  // CryptoModule for the operator NIK (P24-T15): sealed and blind-indexed the
  // way a patient's is, by the same service.
  imports: [AuditModule, CryptoModule],
  controllers: [OwnAccountController],
  providers: [OwnAccountService, OwnAccountRepository],
  exports: [OwnAccountService],
})
export class AccountModule {}
