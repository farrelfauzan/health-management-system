import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { decodeAccessTokenClaims, hasAnyRole, isAccessTokenExpired } from '#lib/auth/access-token-claims';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export function proxy(request: NextRequest) {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const claims = decodeAccessTokenClaims(token);
  if (isAccessTokenExpired(claims) || !hasAnyRole(claims, ADMIN_ROLES)) {
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
