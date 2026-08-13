import type { QueryClient } from '@tanstack/react-query';

import {
  authControllerLockSessionV1,
  authControllerLogoutV1,
} from '#lib/api/generated/auth/auth';
import { clearAccessTokenCookie } from '#lib/auth/access-token-cookie';

const LOGIN_PATH = '/login';

/**
 * Why the session is ending. Only the audit trail and the endpoint differ —
 * the client-side teardown is identical, and sharing one path is what stops
 * the lock button and the idle timeout drifting apart (SJ-9 asks for exactly
 * one code path).
 */
export type SessionEndReason = 'LOGOUT' | 'LOCK' | 'IDLE';

/**
 * Ends the session and destroys every trace of it in this tab.
 *
 * The order matters. The server call goes first so the family is revoked even
 * if the page is torn down immediately afterwards; the cache is cleared before
 * the redirect so no rendered patient data survives into the login screen; and
 * the redirect is a full `assign` rather than a router push, because a client
 * navigation keeps React state — including whatever a component was still
 * holding — alive.
 *
 * `queryClient.clear()` is the part that is easy to forget and the reason a
 * "lock" that only redirected would be theatre: TanStack Query's cache holds
 * the last patient list, the last record, everything the outgoing user looked
 * at, and it would be sitting there for the next person the moment they signed
 * in.
 */
export async function endSession(
  reason: SessionEndReason,
  queryClient?: QueryClient,
): Promise<void> {
  try {
    await (reason === 'LOGOUT' ? authControllerLogoutV1() : authControllerLockSessionV1());
  } catch {
    // Server-side revocation is best-effort. The local session is destroyed
    // regardless, so a network failure cannot strand somebody signed in — and
    // the server's own idle timeout collects the family soon enough.
  }

  queryClient?.clear();
  clearAccessTokenCookie();

  if (typeof window !== 'undefined') {
    window.location.assign(LOGIN_PATH);
  }
}
