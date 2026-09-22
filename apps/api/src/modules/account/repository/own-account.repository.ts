import { Injectable } from '@nestjs/common';

import {
  OwnAccountNikSaveOutcome,
  OwnAccountRecord,
  SaveOwnAccountNikPayload,
} from '@hms/shared-types';

import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';
const NIK_INDEX_COLUMN = 'nik_index';

/**
 * The only projection of `users` this repository returns. Listing the columns
 * keeps `nikCiphertext` and `nikIndex` out of every result: the account
 * screen gets the last four digits and nothing else (D-039).
 */
const OWN_ACCOUNT_SELECT = {
  id: true,
  email: true,
  fullName: true,
  nikLast4: true,
} as const;

/**
 * A P2002 from the NIK write can only be `nik_index`: the statement touches
 * no other unique column. The target is still checked when the driver names
 * one, and accepted when it does not — Prisma's driver adapters do not always
 * fill `meta.target`.
 */
function isNikUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const candidate = err as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== UNIQUE_CONSTRAINT_ERROR_CODE) {
    return false;
  }
  const targets = candidate.meta?.target;
  if (Array.isArray(targets)) {
    return targets.some((target) => String(target).includes(NIK_INDEX_COLUMN));
  }
  if (typeof targets === 'string') {
    return targets.includes(NIK_INDEX_COLUMN);
  }
  return true;
}

/**
 * The signed-in person's own account row (P20-T05).
 *
 * Its own repository rather than a second caller of
 * `AdminManagementRepository`: that one exists to let an administrator act on
 * anybody, and every method it has takes a user id chosen by the caller. A
 * self-service path that borrowed it would be one forgotten argument away from
 * renaming somebody else.
 */
@Injectable()
export class OwnAccountRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identifierCrypto: NationalIdentifierCryptoService,
  ) {}

  async findAccountById(userId: string): Promise<OwnAccountRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: OWN_ACCOUNT_SELECT,
    });
    return user;
  }

  /** Writes the account name, and mirrors it to the doctor profile that account owns. */
  async renameAccount(payload: { userId: string; fullName: string }): Promise<OwnAccountRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: payload.userId },
        data: { fullName: payload.fullName },
        select: OWN_ACCOUNT_SELECT,
      });
      // While `DoctorProfile.fullName` still exists it is the name the doctor
      // directory and every clinical document read (D-027 demotes it, P20-T06
      // and P20-T08 retire the reads). Mirrored inside the transaction so the
      // two can never disagree about what a doctor is called.
      await tx.doctorProfile.updateMany({
        where: { ownerUserId: payload.userId, deletedAt: null },
        data: { fullName: payload.fullName },
      });

      return user;
    });
  }

  /**
   * Seals the operator's NIK onto the account (P24-T15, D-039). The plaintext
   * is encrypted and blind-indexed here, in the same call, so no caller ever
   * holds the ciphertext and the index for two different numbers. The unique
   * index on `nik_index` is what refuses a second account with the same NIK;
   * the violation is reported as an outcome rather than thrown, because a
   * duplicate is an expected answer at the desk, not a fault.
   */
  async saveAccountNik(payload: SaveOwnAccountNikPayload): Promise<OwnAccountNikSaveOutcome> {
    const encrypted = this.identifierCrypto.encryptSearchableIdentifier(payload.nik);
    try {
      await this.prisma.user.update({
        where: { id: payload.userId },
        data: {
          nikCiphertext: encrypted.ciphertext,
          nikIndex: encrypted.index,
          nikLast4: encrypted.last4,
          nikKeyVersion: encrypted.keyVersion,
        },
        select: { id: true },
      });
      return 'SAVED';
    } catch (err: unknown) {
      if (isNikUniqueViolation(err)) {
        return 'DUPLICATE_NIK';
      }
      throw err;
    }
  }
}
