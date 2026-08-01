import { randomBytes } from 'node:crypto';

const RANDOM_BYTE_COUNT = 5;

/**
 * Mints the `kodebooking` HMS returns from `ambil antrean` (P14-T04).
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
