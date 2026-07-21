import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { decodeAccessTokenClaims, hasAnyRole, isAccessTokenExpired } from '#lib/auth/access-token-claims';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const LOGIN_PATH = '/login';
const ADMIN_HOME_PATH = '/admin/dashboard';

export function proxy(request: NextRequest) {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = token ? decodeAccessTokenClaims(token) : null;
  const hasAdminSession = Boolean(token) && !isAccessTokenExpired(claims) && hasAnyRole(claims, ADMIN_ROLES);

  if (request.nextUrl.pathname === LOGIN_PATH) {
    if (hasAdminSession) {
      return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!hasAdminSession) {
    const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
