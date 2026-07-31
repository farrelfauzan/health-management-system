import { QueueNumberAllocationRow } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

/**
 * Allocates daily antrian numbers from `queue_counters` and
 * `poli_queue_counters`.
 *
 * Allocation is one atomic upsert rather than `MAX(queue_number) + 1`:
 * concurrent front-desk and self-service registrations race, and a duplicate
 * ticket calls two patients at once. The first registration of a day creates
 * the counter row and takes number 1; every later one increments it under the
 * row lock. The caller's transaction client is used so the number is
 * allocated inside the same transaction as the registration insert — a failed
 * create rolls the counter back and the number goes to the next caller.
 * Numbers that commit are never reissued: a cancellation leaves a gap, which
 * is what a paper ticket roll does too.
 */
@Injectable()
export class QueueNumberAllocatorRepository {
  async allocateQueueNumber(tx: PrismaTransactionClient, queueDate: Date): Promise<number> {
    const calendarDate = toCalendarDate(queueDate);
    const rows = await tx.$queryRaw<QueueNumberAllocationRow[]>`
      INSERT INTO "queue_counters" ("queue_date", "next_value", "updated_at")
      VALUES (${calendarDate}::date, 2, NOW())
      ON CONFLICT ("queue_date")
      DO UPDATE SET "next_value" = "queue_counters"."next_value" + 1,
                    "updated_at" = NOW()
      RETURNING "next_value" - 1 AS "allocated"
    `;
    return readAllocated(rows, 'Queue counter');
  }

  /**
   * The per-poli sequence (P14-T01): same atomic upsert, keyed on the day and
   * the poli together, so two poli both start at 1 on the same morning and
   * neither one's traffic advances the other's display. The row lock is taken
   * per `(date, poli)`, which also means a busy poli never serialises the
   * quiet one's registrations.
   */
  async allocatePoliQueueNumber(
    tx: PrismaTransactionClient,
    queueDate: Date,
    specialtyId: string,
  ): Promise<number> {
    const calendarDate = toCalendarDate(queueDate);
    const rows = await tx.$queryRaw<QueueNumberAllocationRow[]>`
      INSERT INTO "poli_queue_counters" ("queue_date", "specialty_id", "next_value", "updated_at")
      VALUES (${calendarDate}::date, ${specialtyId}::uuid, 2, NOW())
      ON CONFLICT ("queue_date", "specialty_id")
      DO UPDATE SET "next_value" = "poli_queue_counters"."next_value" + 1,
                    "updated_at" = NOW()
      RETURNING "next_value" - 1 AS "allocated"
    `;
    return readAllocated(rows, 'Poli queue counter');
  }
}

function toCalendarDate(queueDate: Date): string {
  return queueDate.toISOString().slice(0, 10);
}

function readAllocated(rows: QueueNumberAllocationRow[], counterName: string): number {
  const allocated = rows[0]?.allocated;
  if (allocated === undefined) {
    throw new Error(`${counterName} upsert returned no row`);
  }
  return allocated;
}
