import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { decodeAccessTokenClaims, hasAnyRole, isAccessTokenExpired } from '#lib/auth/access-token-claims';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const PATIENT_ROLES = ['PATIENT'];
const LOGIN_PATH = '/login';
const ADMIN_HOME_PATH = '/admin/dashboard';
const PORTAL_HOME_PATH = '/portal/registrations';
const PORTAL_PATH_PREFIX = '/portal';

function buildLoginRedirectWithClearedCookie(request: NextRequest) {
  const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  return response;
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const claims = token ? decodeAccessTokenClaims(token) : null;
  const hasValidSession = Boolean(token) && !isAccessTokenExpired(claims);
  const hasAdminSession = hasValidSession && hasAnyRole(claims, ADMIN_ROLES);
  const hasPatientSession = hasValidSession && hasAnyRole(claims, PATIENT_ROLES);
  const pathname = request.nextUrl.pathname;

  if (pathname === LOGIN_PATH) {
    if (hasAdminSession) {
      return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
    }
    if (hasPatientSession) {
      return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (pathname.startsWith(PORTAL_PATH_PREFIX)) {
    if (hasPatientSession) {
      return NextResponse.next();
    }
    if (hasAdminSession) {
      return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
    }
    return buildLoginRedirectWithClearedCookie(request);
  }

  if (hasAdminSession) {
    return NextResponse.next();
  }

  if (hasPatientSession) {
    return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
  }

  return buildLoginRedirectWithClearedCookie(request);
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*', '/login'],
};
