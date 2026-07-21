import type { AuthTokens } from '@hms/shared-types';

import { setAccessTokenCookie } from '#lib/auth/access-token-cookie';
import { setRefreshTokenCookie } from '#lib/auth/refresh-token-cookie';

export function persistLoginSession(tokens: AuthTokens): void {
  setAccessTokenCookie(tokens.accessToken);
  setRefreshTokenCookie(tokens.refreshToken);
}
