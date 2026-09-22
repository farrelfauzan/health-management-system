import { Injectable } from '@nestjs/common';

import { ClaimMaternalVisitReminderData, MaternalVisitReminderRecord } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

const REMINDER_SELECT = {
  id: true,
  patientId: true,
  visitKey: true,
  status: true,
  attemptedAt: true,
} satisfies Prisma.MaternalVisitReminderSelect;

/**
 * The reminders the worker has sent or tried to send (P25-T17). The unique
 * `(patient_id, visit_key)` is the whole "at most once": a claim is an
 * insert, and a second claim for the same visit — the next sweep, or another
 * replica racing this one — is refused by the index.
 */
@Injectable()
export class MaternalVisitReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Null when this visit already has its reminder row. */
  async claim(data: ClaimMaternalVisitReminderData): Promise<MaternalVisitReminderRecord | null> {
    try {
      return await this.prisma.maternalVisitReminder.create({
        data: { ...data, status: 'PENDING' },
        select: REMINDER_SELECT,
      });
    } catch (caughtError) {
      if ((caughtError as { code?: unknown } | null)?.code === UNIQUE_CONSTRAINT_ERROR_CODE) {
        return null;
      }
      throw caughtError;
    }
  }

  /** Settles the claims one message carried. */
  async markSent(ids: readonly string[], sentAt: Date): Promise<void> {
    await this.prisma.maternalVisitReminder.updateMany({
      where: { id: { in: [...ids] }, status: 'PENDING' },
      data: { status: 'SENT', sentAt },
    });
  }

  async markFailed(ids: readonly string[], failureReason: string): Promise<void> {
    await this.prisma.maternalVisitReminder.updateMany({
      where: { id: { in: [...ids] }, status: 'PENDING' },
      data: { status: 'FAILED', failureReason },
    });
  }

  /** The reminder rows of these visits, for the worklist's "sent" column. */
  async listByVisitKeys(visitKeys: readonly string[]): Promise<MaternalVisitReminderRecord[]> {
    if (visitKeys.length === 0) {
      return [];
    }
    return this.prisma.maternalVisitReminder.findMany({
      where: { visitKey: { in: [...visitKeys] } },
      select: REMINDER_SELECT,
    });
  }
}
