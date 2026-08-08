import { ChannelSessionReference } from '@hms/shared-types';

/** Separates the two halves of a session token. Not a character a UUID or an ISO date contains. */
const SESSION_REFERENCE_SEPARATOR = '@';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The token `list_available_sessions` hands out and `book_appointment` takes
 * back.
 *
 * **A session usually has no id yet.** Sessions are materialised lazily
 * (appointment revamp §3.2): the row is created by the first booking, so a
 * window nobody has booked is a projection with `id: null`. The channel
 * therefore cannot address a session by primary key, and what it addresses
 * instead is the pair that identifies one uniquely — the doctor's schedule
 * window and the calendar date.
 *
 * It is deliberately opaque to the model rather than a readable
 * `doctor/date` pair. The model's job is to echo back a value the previous
 * tool returned; making the token meaningful would invite it to *construct*
 * one, and a constructed booking target is a booking the customer never chose.
 * The decode below is strict for the same reason: an unparseable token is a
 * refusal, never a best guess.
 */
export function encodeChannelSessionReference(reference: ChannelSessionReference): string {
  return `${reference.scheduleId}${SESSION_REFERENCE_SEPARATOR}${reference.sessionDate}`;
}

/**
 * Parses a token back, or returns null. Null means the value did not come from
 * {@link encodeChannelSessionReference} — a model that invented one, or an
 * older token whose shape has changed — and the caller answers "I could not
 * find that session" rather than looking anything up.
 *
 * The doctor is deliberately *not* carried in the token: it is resolved from
 * the schedule window, so a token cannot pair one doctor's window with another
 * doctor's id.
 */
export function decodeChannelSessionReference(
  token: string,
): Omit<ChannelSessionReference, 'doctorId'> | null {
  const parts = token.trim().split(SESSION_REFERENCE_SEPARATOR);
  const scheduleId = parts[0];
  const sessionDate = parts[1];
  if (parts.length !== 2 || scheduleId === undefined || sessionDate === undefined) {
    return null;
  }
  if (!UUID_PATTERN.test(scheduleId) || !ISO_DATE_PATTERN.test(sessionDate)) {
    return null;
  }
  return { scheduleId, sessionDate };
}
