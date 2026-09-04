import { NextResponse, type NextRequest } from 'next/server';

import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { hasAnyRole, hasPermission } from '#lib/auth/access-token-claims';
import { OFFBOARDED_VAULT_PATHS } from '#lib/auth/offboarding-session';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';
import { resolveSessionClaims } from '#lib/auth/session-claims';

/**
 * Shell access is decided by the `portal.*` permission claims (IMP-3), so a
 * custom role composed in the IAM screens reaches a shell without borrowing a
 * seeded role code. The role arrays remain as a fallback for tokens and
 * session hints minted before the portal permissions were seeded, and for
 * the pharmacy workspace, which has no permission key yet.
 *
 * Either way this file gates navigation only: the API's PermissionsGuard
 * re-resolves permissions from the database on every request, so a forged or
 * stale claim buys a shell frame whose every data call still 403s.
 */
const ADMIN_PORTAL_PERMISSION = 'portal.admin-access:any';
const DOCTOR_PORTAL_PERMISSION = 'portal.doctor-access:any';
const PATIENT_PORTAL_PERMISSION = 'portal.patient-access:own';
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
  response.cookies.delete(SESSION_HINT_COOKIE_NAME);
  return response;
}

export function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const sessionHint = request.cookies.get(SESSION_HINT_COOKIE_NAME)?.value;
  const claims = resolveSessionClaims({ accessToken, sessionHint });
  const hasValidSession = claims !== null;
  const hasAdminSession =
    hasValidSession &&
    (hasPermission(claims, ADMIN_PORTAL_PERMISSION) || hasAnyRole(claims, ADMIN_ROLES));
  // Admin wins when a user holds both: the admin shell is a superset of what
  // the doctor shell shows, and bouncing such a user to /doctor would hide
  // surfaces they are entitled to. The same precedence keeps SUPER_ADMIN —
  // whose blanket grant includes every portal permission — pinned to the
  // admin shell rather than leaking into the doctor or patient views.
  const hasDoctorSession =
    hasValidSession &&
    !hasAdminSession &&
    (hasPermission(claims, DOCTOR_PORTAL_PERMISSION) || hasAnyRole(claims, DOCTOR_ROLES));
  const hasPharmacistSession =
    hasValidSession && !hasAdminSession && hasAnyRole(claims, PHARMACIST_ROLES);
  const hasPatientSession =
    hasValidSession &&
    !hasAdminSession &&
    (hasPermission(claims, PATIENT_PORTAL_PERMISSION) || hasAnyRole(claims, PATIENT_ROLES));
  const pathname = request.nextUrl.pathname;
  // P16-T41. Someone in their offboarding window has exactly one page: their
  // own vault, in whichever shell they belong to. Every other route under the
  // matcher bounces there — including the shell's home — so signing in lands
  // on their documents and nowhere else. Navigation only, as ever: the API
  // has already reduced what they can call.
  const offboardedVaultPath = resolveOffboardedVaultPath();

  function resolveOffboardedVaultPath(): string | null {
    if (!hasValidSession || !claims.offboardedUntil) {
      return null;
    }
    if (hasAdminSession) {
      return OFFBOARDED_VAULT_PATHS.admin;
    }
    return hasDoctorSession ? OFFBOARDED_VAULT_PATHS.doctor : null;
  }

  function redirectToHome(): NextResponse {
    if (offboardedVaultPath !== null) {
      return NextResponse.redirect(new URL(offboardedVaultPath, request.url));
    }
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
    if (accessToken || sessionHint) {
      return buildLoginRedirectWithClearedCookie(request);
    }
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (offboardedVaultPath !== null && pathname !== offboardedVaultPath) {
    return NextResponse.redirect(new URL(offboardedVaultPath, request.url));
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
