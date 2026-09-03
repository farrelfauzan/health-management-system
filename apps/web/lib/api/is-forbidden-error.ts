/**
 * Whether a query error is the API refusing the caller.
 *
 * Read off the response status rather than the message: the message is server
 * copy that may be translated or reworded, and a UI branch keyed on prose
 * breaks silently the first time someone edits it.
 *
 * A 403 is worth distinguishing because it is usually a *state*, not a
 * failure — a doctor's assignment revoked mid-session (§7.2.7) — and telling
 * someone their access ended is a different message from telling them
 * something broke.
 */
export function isForbiddenError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 403
  );
}
