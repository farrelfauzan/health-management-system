import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { hasAnyRole } from '#lib/auth/access-token-claims';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const DOCTOR_ROLES = ['DOCTOR'];
const PHARMACIST_ROLES = ['PHARMACIST'];
const PATIENT_ROLES = ['PATIENT'];
const LOGIN_PATH = '/login';
const ADMIN_HOME_PATH = '/admin/dashboard';
const DOCTOR_HOME_PATH = '/doctor/dashboard';
const PHARMACIST_HOME_PATH = '/admin/pharmacy';
const PORTAL_HOME_PATH = '/portal/registrations';
const DOCTOR_PATH_PREFIX = '/doctor';
const PORTAL_PATH_PREFIX = '/portal';

function buildLoginRedirectWithClearedCookie(request: NextRequest) {
  const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);
  return response;
}

export function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, refreshToken });
  const hasValidSession = claims !== null;
  const hasAdminSession = hasValidSession && hasAnyRole(claims, ADMIN_ROLES);
  // Admin wins when a user holds both: the admin shell is a superset of what
  // the doctor shell shows, and bouncing such a user to /doctor would hide
  // surfaces they are entitled to.
  const hasDoctorSession =
    hasValidSession && !hasAdminSession && hasAnyRole(claims, DOCTOR_ROLES);
  const hasPharmacistSession =
    hasValidSession && !hasAdminSession && hasAnyRole(claims, PHARMACIST_ROLES);
  const hasPatientSession = hasValidSession && hasAnyRole(claims, PATIENT_ROLES);
  const pathname = request.nextUrl.pathname;

  function redirectToHome(): NextResponse {
    if (hasAdminSession) {
      return NextResponse.redirect(new URL(ADMIN_HOME_PATH, request.url));
    }
    if (hasDoctorSession) {
      return NextResponse.redirect(new URL(DOCTOR_HOME_PATH, request.url));
    }
    if (hasPharmacistSession) {
      return NextResponse.redirect(new URL(PHARMACIST_HOME_PATH, request.url));
    }
    if (hasPatientSession) {
      return NextResponse.redirect(new URL(PORTAL_HOME_PATH, request.url));
    }
    return buildLoginRedirectWithClearedCookie(request);
  }

  if (pathname === LOGIN_PATH) {
    if (hasAdminSession || hasDoctorSession || hasPharmacistSession || hasPatientSession) {
      return redirectToHome();
    }
    return NextResponse.next();
  }

  if (!hasValidSession) {
    if (accessToken || refreshToken) {
      return buildLoginRedirectWithClearedCookie(request);
    }
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (pathname.startsWith(PORTAL_PATH_PREFIX)) {
    return hasPatientSession ? NextResponse.next() : redirectToHome();
  }

  if (pathname.startsWith(DOCTOR_PATH_PREFIX)) {
    return hasDoctorSession ? NextResponse.next() : redirectToHome();
  }

  if (pathname === PHARMACIST_HOME_PATH && hasPharmacistSession) {
    return NextResponse.next();
  }

  // Everything else under the matcher is the admin shell.
  return hasAdminSession ? NextResponse.next() : redirectToHome();
}

export const config = {
  matcher: ['/admin/:path*', '/doctor/:path*', '/portal/:path*', '/login'],
};
