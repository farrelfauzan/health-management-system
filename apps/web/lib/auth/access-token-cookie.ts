export const ACCESS_TOKEN_COOKIE_NAME = 'hms_access_token';

const COOKIE_MAX_AGE_SECONDS = 60 * 15;

export function readAccessTokenFromCookieString(cookieSource: string): string | null {
  const items = cookieSource.split(';').map((item) => item.trim());
  const tokenEntry = items.find((item) => item.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`));

  if (!tokenEntry) {
    return null;
  }

  const value = tokenEntry.slice(`${ACCESS_TOKEN_COOKIE_NAME}=`.length);
  return value.length > 0 ? decodeURIComponent(value) : null;
}

export function readAccessTokenFromBrowserCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return readAccessTokenFromCookieString(document.cookie);
}

export function setAccessTokenCookie(accessToken: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const encodedToken = encodeURIComponent(accessToken);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';

  document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=${encodedToken}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

export function clearAccessTokenCookie() {
  if (typeof document === 'undefined') {
    return;
  }

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}
