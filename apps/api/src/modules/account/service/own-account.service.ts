import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { OwnAccountRecord } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { OwnAccountRepository } from '../repository/own-account.repository';

/**
 * What a person may do to their own account: read it, correct the name
 * (P20-T05, D-027), and add or replace their NIK (P24-T15, D-039).
 *
 * Everything else about an account — its roles, whether it is active, which
 * organisation unit it sits in, the address it signs in with — stays
 * administrative. That is the same line D-025 drew for a doctor's own profile,
 * and it is drawn here by what this service offers rather than by a check,
 * because a method that does not exist cannot be reached by a wrong argument.
 */
@Injectable()
export class OwnAccountService {
  constructor(
    private readonly ownAccountRepository: OwnAccountRepository,
    private readonly auditService: AuditService,
  ) {}

  async getOwnAccount(userId: string): Promise<OwnAccountRecord> {
    const account = await this.ownAccountRepository.findAccountById(userId);
    if (account === null) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  /**
   * Corrects the name on the caller's own account.
   *
   * The only rename path there is: the doctor's own-profile route calls this
   * one too, so a doctor who renames themselves from the clinical screen and
   * one who renames themselves from the account screen end up with the same
   * two rows written.
   */
  async renameOwnAccount(userId: string, fullName: string): Promise<OwnAccountRecord> {
    await this.getOwnAccount(userId);
    const renamed = await this.ownAccountRepository.renameAccount({ userId, fullName });
    await this.auditService.record({
      action: 'USER_UPDATED',
      resource: 'user',
      actorUserId: userId,
      resourceId: userId,
      metadata: { scope: 'OWN', changedFields: ['fullName'] },
    });
    return renamed;
  }

  /**
   * Adds or replaces the NIK on the caller's own account (D-039). The value
   * itself never reaches the audit row or a log line: the row records that
   * the field changed, and the response carries the last four digits only.
   * A NIK another account already holds is refused with 409 — one person,
   * one account.
   */
  async saveOwnAccountNik(userId: string, nik: string): Promise<OwnAccountRecord> {
    await this.getOwnAccount(userId);
    const outcome = await this.ownAccountRepository.saveAccountNik({ userId, nik });
    if (outcome === 'DUPLICATE_NIK') {
      throw new ConflictException('This NIK is already registered to another account');
    }
    await this.auditService.record({
      action: 'USER_UPDATED',
      resource: 'user',
      actorUserId: userId,
      resourceId: userId,
      metadata: { scope: 'OWN', changedFields: ['nik'] },
    });
    return this.getOwnAccount(userId);
  }
}
