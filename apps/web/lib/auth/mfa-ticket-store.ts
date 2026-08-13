/**
 * Holds the `mfa_pending` ticket for the handful of seconds a two-phase login
 * takes (SJ-8).
 *
 * **Why a module variable and not a request argument.** The generated client
 * takes no per-call axios options, and giving Orval's mutator a second
 * parameter to add them shifts the `signal` argument in every generated
 * function — 48 unrelated call sites across the app. Rewriting all of those
 * inside an authentication change would bury the part a reviewer needs to
 * read. So the ticket is handed to the axios request interceptor out of band.
 *
 * **Why that is safe.** The interceptor attaches it to exactly three paths,
 * listed below, and nothing outside the login flow calls them. A stray request
 * cannot pick the ticket up, and the worst case if one somehow did — a ticket
 * sent to a route that wants an access token — is a 401.
 *
 * **Why it is not persisted.** A half-authenticated credential written to a
 * cookie or to storage outlives the attempt it belongs to, and a stalled
 * challenge would leave one sitting on disk. This dies with the tab, and the
 * server gives it two minutes regardless.
 */
const TICKET_AUTHENTICATED_PATHS: readonly string[] = [
  '/api/v1/auth/mfa/enroll',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/mfa/challenge',
];

let pendingTicket: string | null = null;

export const mfaTicketStore = {
  set(ticket: string | null): void {
    pendingTicket = ticket;
  },

  /** The ticket to present on this URL, or null to fall back to the cookie. */
  resolveFor(url: string | undefined): string | null {
    if (!pendingTicket || !url) {
      return null;
    }
    return TICKET_AUTHENTICATED_PATHS.some((path) => url.includes(path)) ? pendingTicket : null;
  },
};
