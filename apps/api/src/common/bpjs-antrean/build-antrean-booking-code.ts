import { randomBytes } from 'node:crypto';

const RANDOM_BYTE_COUNT = 5;

/**
 * Mints a `kodebooking` — the identifier BPJS holds for one queue entry.
 *
 * Used in **both** directions, which is why it lives in `common/`: the
 * inbound `ambil antrean` service (P14-T04) mints one for a Mobile JKN
 * booking, and the outbound `antrean/add` publisher (P14-T05) mints one for a
 * walk-in. Two generators would eventually disagree, and the column they both
 * write is unique.
 *
 * The facility issues this code, not BPJS — it is the handle the member's
 * phone then carries back on `sisa antrean` and `batal antrean`. Two
 * properties matter and neither is cosmetic:
 *
 * - **Unpredictable.** `sisa antrean` and `batal antrean` are addressed by
 *   this code alone. A sequential or date-derived code would let anyone past
 *   the guards cancel other members' bookings by counting; ten random hex
 *   characters do not.
 * - **Unique.** The column is unique in the database, so a collision fails
 *   the write rather than silently overwriting a booking.
 *
 * The readable prefix is there for the humans debugging a UAT run — it names
 * the poli and the date without needing a query.
 */
export function buildAntreanBookingCode(params: {
  poliCode: string;
  examinationDate: string;
}): string {
  const compactDate = params.examinationDate.replace(/-/g, '');
  const randomSuffix = randomBytes(RANDOM_BYTE_COUNT).toString('hex').toUpperCase();
  return `${params.poliCode}-${compactDate}-${randomSuffix}`;
}
