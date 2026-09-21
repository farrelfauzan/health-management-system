import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { OwnAccountController } from './controller/own-account.controller';
import { OwnAccountRepository } from './repository/own-account.repository';
import { OwnAccountService } from './service/own-account.service';

/**
 * Self-service for the account itself (P20-T05): the name a person carries,
 * separate from every role-shaped profile hanging off it.
 *
 * Exports the service because the doctor's own-profile route renames through
 * it — one rename rule, whichever screen the doctor started from.
 */
@Module({
  imports: [AuditModule],
  controllers: [OwnAccountController],
  providers: [OwnAccountService, OwnAccountRepository],
  exports: [OwnAccountService],
})
export class AccountModule {}
