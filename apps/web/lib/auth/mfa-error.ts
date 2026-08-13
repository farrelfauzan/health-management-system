import { isAxiosError } from 'axios';

export type MfaErrorMessages = {
  rejected: string;
  expired: string;
  throttled: string;
  failed: string;
};

/**
 * Turns an MFA failure into something a user can act on (SJ-8).
 *
 * The API answers every bad code with the same 401 and the same body, on
 * purpose — distinguishing "wrong" from "already used" would confirm that a
 * guessed value was real. So this cannot tell those apart either, and does not
 * try. What it can separate is the case where the *ticket* died rather than the
 * code: a 401 on a route the user has not yet submitted a code to, and the 429
 * that means they should stop typing for a minute. Those two change what the
 * user should do next; the rest do not.
 */
export function resolveMfaErrorMessage(error: unknown, messages: MfaErrorMessages): string {
  if (!isAxiosError(error)) {
    return messages.failed;
  }
  if (error.response?.status === 429) {
    return messages.throttled;
  }
  if (error.response?.status === 401) {
    return isTicketRejection(error.response.data) ? messages.expired : messages.rejected;
  }
  return messages.failed;
}

/**
 * The guard refuses a dead ticket before the handler ever runs, with its own
 * message. Matching on it is a little brittle, but the alternative — showing
 * "that code is wrong" to someone whose two minutes simply ran out — sends
 * them re-typing a code that was never the problem.
 */
function isTicketRejection(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const message = (payload as { error?: { message?: string } }).error?.message ?? '';
  return message.toLowerCase().includes('ticket');
}
