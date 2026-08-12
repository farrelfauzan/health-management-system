import { authControllerLogoutV1 } from '#lib/api/generated/auth/auth';
import { clearAccessTokenCookie } from '#lib/auth/access-token-cookie';

const LOGIN_PATH = '/login';

/**
 * Ends the session. The refresh token is `httpOnly` (SJ-6), so revocation is
 * the server's job in both directions: it reads the cookie to find the family
 * and clears the cookie on the way out. This tier drops the access token and
 * leaves.
 */
export async function executeLogout(): Promise<void> {
  try {
    await authControllerLogoutV1();
  } catch {
    // Server-side revocation is best-effort; the local session is cleared
    // regardless, so a network failure cannot strand somebody signed in.
  }

  clearAccessTokenCookie();

  if (typeof window !== 'undefined') {
    window.location.assign(LOGIN_PATH);
  }
}
