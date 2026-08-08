import { BookAppointmentResult } from '@hms/shared-types';

type ConfirmedBooking = Extract<BookAppointmentResult, { outcome: 'CONFIRMED' }>;

/**
 * The booking confirmation, worded by this codebase (strategy §4.2, §5.3).
 *
 * **Deterministic on purpose, and it is what the acceptance criteria rest
 * on.** Three different paths reach it — a booking that attached to a verified
 * patient record, one that fell through to a draft after a failed challenge,
 * and one for a number that matched nothing — and all three produce the same
 * bytes for the same session. A model composing this sentence would phrase the
 * three slightly differently, and the difference would be a readable answer to
 * "is this number in your registry?" (§5.1.1: no registry oracle).
 *
 * The second thing it guarantees is the negative one: there is **no queue
 * position here and no arrival time**. The session model assigns queue numbers
 * at check-in (revamp §8.1), so a number promised in chat is a promise the
 * clinic cannot keep — and a promise a model, handed a booking result and
 * asked to be helpful, will otherwise invent.
 */
export function buildBookingConfirmationReply(booking: ConfirmedBooking): string {
  return [
    '✅ Janji temu Anda sudah tercatat.',
    '',
    `Kode booking: ${booking.referenceCode}`,
    `Dokter: ${booking.doctorName} (${booking.specialty})`,
    `Tanggal: ${booking.sessionDate}`,
    `Jam sesi: ${booking.startTime}–${booking.endTime}`,
    '',
    booking.arrivalInstruction,
    '',
    'Mohon bawa KTP dan kartu BPJS (jika ada) — petugas akan melengkapi data Anda di loket pendaftaran.',
  ].join('\n');
}
