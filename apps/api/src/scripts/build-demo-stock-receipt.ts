import { CreateStockReceiptInput } from '@hms/shared-types';

/** On-hand quantity each medication is brought back up to. */
const DEMO_STOCK_TARGET = 500;

/** Below this the seed tops the item up; at or above it a re-run adds nothing. */
const DEMO_STOCK_FLOOR = 100;

/** Years of shelf life the demo batch is given, so FEFO never skips it as expired. */
const DEMO_SHELF_LIFE_YEARS = 2;

const LEAP_DAY = '02-29';
const DAY_BEFORE_LEAP_DAY = '02-28';

/**
 * The goods receipt that brings one medication back to the demo stock level,
 * or `null` when it already has enough. Topping up to a target rather than
 * always receiving a batch is what makes a re-run receive nothing, while a
 * database drained by earlier rehearsals is refilled before the next demo.
 *
 * `asOfDate` is the clinic-local day (`YYYY-MM-DD`), which also names the
 * batch so a receipt is traceable to the run that made it.
 */
export function buildDemoStockReceipt(input: {
  medicationId: string;
  stockQty: number;
  asOfDate: string;
}): CreateStockReceiptInput | null {
  if (input.stockQty >= DEMO_STOCK_FLOOR) {
    return null;
  }
  const expiryYear = Number(input.asOfDate.slice(0, 4)) + DEMO_SHELF_LIFE_YEARS;
  const monthDay = input.asOfDate.slice(5);
  return {
    medicationId: input.medicationId,
    batchNumber: `DEMO-${input.asOfDate.replaceAll('-', '')}`,
    expiryDate: `${expiryYear}-${monthDay === LEAP_DAY ? DAY_BEFORE_LEAP_DAY : monthDay}`,
    quantity: DEMO_STOCK_TARGET - Math.max(input.stockQty, 0),
    notes: 'Demo seed stock',
  };
}
