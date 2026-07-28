import { InvoiceNumberAllocationRow } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';

const INVOICE_NUMBER_PREFIX = 'INV';

const INVOICE_NUMBER_WIDTH = 4;

/**
 * Allocates per-day invoice numbers from `invoice_counters` — the antrian
 * counter reasoning applied to the cashier. Allocation is one atomic upsert
 * rather than `MAX + 1`, which races when two cashiers bill at once. The
 * caller's transaction client is used so the number is allocated inside the
 * same transaction as the invoice insert: a rolled-back create returns its
 * number to the pool, while a committed one is never reissued — a voided
 * invoice leaves a gap exactly like a torn paper receipt.
 */
@Injectable()
export class InvoiceNumberAllocatorRepository {
  async allocateInvoiceNumber(tx: PrismaTransactionClient, invoiceDate: Date): Promise<string> {
    const calendarDate = invoiceDate.toISOString().slice(0, 10);
    const rows = await tx.$queryRaw<InvoiceNumberAllocationRow[]>`
      INSERT INTO "invoice_counters" ("invoice_date", "next_value", "updated_at")
      VALUES (${calendarDate}::date, 2, NOW())
      ON CONFLICT ("invoice_date")
      DO UPDATE SET "next_value" = "invoice_counters"."next_value" + 1,
                    "updated_at" = NOW()
      RETURNING "next_value" - 1 AS "allocated"
    `;
    const allocated = rows[0]?.allocated;
    if (allocated === undefined) {
      throw new Error('Invoice counter upsert returned no row');
    }
    const compactDate = calendarDate.replaceAll('-', '');
    const sequence = String(allocated).padStart(INVOICE_NUMBER_WIDTH, '0');
    return `${INVOICE_NUMBER_PREFIX}/${compactDate}/${sequence}`;
  }
}
