import { Injectable } from '@nestjs/common';

import { OwnAccountRecord } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async findAccountById(userId: string): Promise<OwnAccountRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, fullName: true },
    });
    return user;
  }

  /** Writes the account name, and mirrors it to the doctor profile that account owns. */
  async renameAccount(payload: { userId: string; fullName: string }): Promise<OwnAccountRecord> {
    return this.prisma.executeTransaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: payload.userId },
        data: { fullName: payload.fullName },
        select: { id: true, email: true, fullName: true },
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
}
