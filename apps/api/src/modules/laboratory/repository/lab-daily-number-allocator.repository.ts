import { LabNumberAllocationRow } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

const NUMBER_WIDTH = 4;

/**
 * Allocates the two per-day sequences the laboratory needs — order numbers
 * (`LAB/YYYYMMDD/####`) and specimen accession numbers (`SPC/YYYYMMDD/####`).
 *
 * Both follow `InvoiceNumberAllocatorRepository` exactly: one atomic
 * `INSERT … ON CONFLICT … RETURNING` rather than `MAX + 1`, which races when
 * two doctors order or two analysts collect in the same instant. The caller's
 * transaction client is used so the number is allocated inside the same
 * transaction as the row it belongs to: a rolled-back write returns its number
 * to the pool, while a committed one is never reissued.
 *
 * One class for both because the two counters differ only in table, column and
 * prefix — and a second copy of a concurrency-critical upsert is a second
 * place for it to be got subtly wrong.
 */
@Injectable()
export class LabDailyNumberAllocatorRepository {
  async allocateOrderNumber(tx: PrismaTransactionClient, orderDate: Date): Promise<string> {
    const calendarDate = toCalendarDate(orderDate);
    const rows = await tx.$queryRaw<LabNumberAllocationRow[]>`
      INSERT INTO "lab_order_counters" ("order_date", "next_value", "updated_at")
      VALUES (${calendarDate}::date, 2, NOW())
      ON CONFLICT ("order_date")
      DO UPDATE SET "next_value" = "lab_order_counters"."next_value" + 1,
                    "updated_at" = NOW()
      RETURNING "next_value" - 1 AS "allocated"
    `;
    return formatNumber('LAB', calendarDate, readAllocated(rows, 'lab_order_counters'));
  }

  async allocateAccessionNumber(
    tx: PrismaTransactionClient,
    collectionDate: Date,
  ): Promise<string> {
    const calendarDate = toCalendarDate(collectionDate);
    const rows = await tx.$queryRaw<LabNumberAllocationRow[]>`
      INSERT INTO "lab_specimen_counters" ("collection_date", "next_value", "updated_at")
      VALUES (${calendarDate}::date, 2, NOW())
      ON CONFLICT ("collection_date")
      DO UPDATE SET "next_value" = "lab_specimen_counters"."next_value" + 1,
                    "updated_at" = NOW()
      RETURNING "next_value" - 1 AS "allocated"
    `;
    return formatNumber('SPC', calendarDate, readAllocated(rows, 'lab_specimen_counters'));
  }
}

function toCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function readAllocated(rows: LabNumberAllocationRow[], counterTable: string): number {
  const allocated = rows[0]?.allocated;
  if (allocated === undefined) {
    throw new Error(`${counterTable} upsert returned no row`);
  }
  return allocated;
}

function formatNumber(prefix: string, calendarDate: string, allocated: number): string {
  const compactDate = calendarDate.replaceAll('-', '');
  return `${prefix}/${compactDate}/${String(allocated).padStart(NUMBER_WIDTH, '0')}`;
}
