/**
 * The timestamp label on a replayed turn. Deliberately short — the thread is
 * read top to bottom, so the reader needs "when in the conversation", not a
 * full date stamp on every bubble.
 */
export function formatTurnTime(isoTimestamp: string, locale = 'id'): string {
  const turnDate = new Date(isoTimestamp);
  if (Number.isNaN(turnDate.getTime())) {
    return '-';
  }
  const datePart = turnDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const timePart = turnDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}
