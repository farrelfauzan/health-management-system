export const REFRESH_TOKEN_COOKIE_NAME = 'hms_refresh_token';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function readRefreshTokenFromBrowserCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const items = document.cookie.split(';').map((item) => item.trim());
  const tokenEntry = items.find((item) => item.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`));

  if (!tokenEntry) {
    return null;
  }

  const value = tokenEntry.slice(`${REFRESH_TOKEN_COOKIE_NAME}=`.length);
  return value.length > 0 ? decodeURIComponent(value) : null;
}

export function setRefreshTokenCookie(refreshToken: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const encodedToken = encodeURIComponent(refreshToken);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';

  document.cookie = `${REFRESH_TOKEN_COOKIE_NAME}=${encodedToken}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

export function clearRefreshTokenCookie() {
  if (typeof document === 'undefined') {
    return;
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${REFRESH_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}
