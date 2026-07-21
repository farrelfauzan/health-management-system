import { authControllerLogoutV1 } from '#lib/api/generated/auth/auth';
import { clearAccessTokenCookie } from '#lib/auth/access-token-cookie';
import {
  clearRefreshTokenCookie,
  readRefreshTokenFromBrowserCookie,
} from '#lib/auth/refresh-token-cookie';

const LOGIN_PATH = '/login';

export async function executeLogout(): Promise<void> {
  const refreshToken = readRefreshTokenFromBrowserCookie();

  if (refreshToken) {
    try {
      await authControllerLogoutV1({ refreshToken });
    } catch {
      // Server-side revocation is best-effort; the local session is cleared regardless.
    }
  }

  clearAccessTokenCookie();
  clearRefreshTokenCookie();

  if (typeof window !== 'undefined') {
    window.location.assign(LOGIN_PATH);
  }
}
