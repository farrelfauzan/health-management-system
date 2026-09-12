/**
 * How many recent failed requests the buffer keeps.
 *
 * Five, matching `MAX_BUG_REPORT_REQUEST_IDS` in the shared schema — the API
 * refuses more, so keeping more would only guarantee the last few are dropped
 * silently at submit.
 */
const MAX_BUFFERED_REQUESTS = 5;

/**
 * One failed request, reduced to what a developer can act on.
 *
 * **Never the URL.** A path in this product carries record ids and a query
 * string carries search terms — `?nik=…`, a patient name in a search box — and
 * this buffer is attached to a bug report that leaves the clinic. The method and
 * the status say what kind of call broke; the request id is what finds the
 * server-side log line, which has the URL anyway, on our side of the boundary.
 */
export type FailedRequestNote = {
  readonly method: string;
  readonly status: number;
  readonly requestId: string;
};

const failedRequests: FailedRequestNote[] = [];

/**
 * Remembers one failed response for the bug-report dialog (P23-T11).
 *
 * These stand in for the screenshots this version deliberately does not collect
 * (decision, 11 Sep 2026): a screenshot is the likeliest carrier of patient data
 * and would open a whole upload surface, where a request id points at a log line
 * we already have.
 *
 * In memory only, and deliberately so — this is a tab's recent history, not a
 * record. It dies with the tab, is never written to storage, and is never sent
 * anywhere except inside a report the reporter chose to file.
 */
export function recordFailedRequest(note: FailedRequestNote): void {
  if (note.requestId === '') {
    return;
  }
  failedRequests.unshift(note);
  failedRequests.splice(MAX_BUFFERED_REQUESTS);
}

/** The most recent failed requests, newest first. */
export function readFailedRequestIds(): string[] {
  return failedRequests.map((note) => note.requestId);
}

/** The buffer with its detail, for the read-only "what we'll also send" list. */
export function readFailedRequests(): readonly FailedRequestNote[] {
  return [...failedRequests];
}

/** Empties the buffer. Exists for tests, and for the dialog after a successful send. */
export function clearFailedRequests(): void {
  failedRequests.length = 0;
}
