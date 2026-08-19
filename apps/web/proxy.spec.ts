// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { SESSION_HINT_COOKIE_NAME } from '#lib/auth/session-hint-cookie';

const BASE_URL = 'http://localhost:3000';

function encodeBase64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildToken(claims: object): string {
  return `${encodeBase64Url({ alg: 'HS256', typ: 'JWT' })}.${encodeBase64Url(claims)}.signature`;
}

/** The API's session hint: base64url JSON, no signature — see SJ-6. */
function buildSessionHint(claims: { exp: number; roles: string[]; permissions?: string[] }): string {
  return encodeBase64Url(claims);
}

function buildRequest(path: string, token?: string, sessionHint?: string): NextRequest {
  const cookies = [
    token ? `${ACCESS_TOKEN_COOKIE_NAME}=${token}` : null,
    sessionHint ? `${SESSION_HINT_COOKIE_NAME}=${sessionHint}` : null,
  ].filter((cookie): cookie is string => cookie !== null);
  const headers = cookies.length > 0 ? { cookie: cookies.join('; ') } : undefined;
  return new NextRequest(`${BASE_URL}${path}`, { headers });
}

function futureUnix(): number {
  return Math.floor(Date.now() / 1000) + 60 * 10;
}

function pastUnix(): number {
  return Math.floor(Date.now() / 1000) - 60 * 10;
}

describe('proxy', () => {
  it('redirects /admin requests without a token to /login', () => {
    const response = proxy(buildRequest('/admin/administration'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
  });

  it('redirects expired sessions to /login and clears the cookie', () => {
    const expiredToken = buildToken({ exp: pastUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/administration', expiredToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value).toBe('');
  });

  it('sends a doctor reaching for the admin shell to their own shell', () => {
    const doctorToken = buildToken({ exp: futureUnix(), roles: ['DOCTOR'] });
    const response = proxy(buildRequest('/admin/administration', doctorToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/doctor/dashboard`);
  });

  it('clears the session of a valid token holding no known shell role', () => {
    const strangerToken = buildToken({ exp: futureUnix(), roles: ['AUDITOR'] });
    const response = proxy(buildRequest('/admin/administration', strangerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value).toBe('');
  });

  it('allows /admin requests with a valid admin session', () => {
    const adminToken = buildToken({ exp: futureUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/administration', adminToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows a pharmacist into the pharmacy workspace', () => {
    const pharmacistToken = buildToken({ exp: futureUnix(), roles: ['PHARMACIST'] });
    const response = proxy(buildRequest('/admin/pharmacy', pharmacistToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps a pharmacist out of unrelated admin routes', () => {
    const pharmacistToken = buildToken({ exp: futureUnix(), roles: ['PHARMACIST'] });
    const response = proxy(buildRequest('/admin/administration', pharmacistToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/admin/pharmacy`);
  });

  /**
   * The window between the access token expiring and the client refreshing it.
   * Without the hint this reload would bounce a live session to /login.
   */
  it('allows an expired access session while the session hint is still valid', () => {
    const expiredAccessToken = buildToken({ exp: pastUnix(), roles: ['ADMIN'] });
    const sessionHint = buildSessionHint({ exp: futureUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/administration', expiredAccessToken, sessionHint));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('refuses an expired access token once the session hint has expired too', () => {
    const expiredAccessToken = buildToken({ exp: pastUnix(), roles: ['ADMIN'] });
    const staleHint = buildSessionHint({ exp: pastUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/administration', expiredAccessToken, staleHint));

    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
  });

  /**
   * The hint is unsigned by design — it authorises nothing. Garbage in it must
   * read as "no session" rather than crash the gate.
   */
  it('treats an unparseable session hint as no session at all', () => {
    const expiredAccessToken = buildToken({ exp: pastUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/administration', expiredAccessToken, 'not-base64'));

    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
  });

  it('redirects an authenticated admin visiting /login to /admin/dashboard', () => {
    const adminToken = buildToken({ exp: futureUnix(), roles: ['SUPER_ADMIN'] });
    const response = proxy(buildRequest('/login', adminToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/admin/dashboard`);
  });

  it('renders /login for unauthenticated visitors', () => {
    const response = proxy(buildRequest('/login'));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects an authenticated patient visiting /login to the portal', () => {
    const patientToken = buildToken({ exp: futureUnix(), roles: ['PATIENT'] });
    const response = proxy(buildRequest('/login', patientToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/portal/registrations`);
  });

  it('redirects an authenticated pharmacist visiting /login to pharmacy', () => {
    const pharmacistToken = buildToken({ exp: futureUnix(), roles: ['PHARMACIST'] });
    const response = proxy(buildRequest('/login', pharmacistToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/admin/pharmacy`);
  });

  it('redirects a patient session hitting /admin to the portal', () => {
    const patientToken = buildToken({ exp: futureUnix(), roles: ['PATIENT'] });
    const response = proxy(buildRequest('/admin/dashboard', patientToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/portal/registrations`);
  });

  it('allows /portal requests with a valid patient session', () => {
    const patientToken = buildToken({ exp: futureUnix(), roles: ['PATIENT'] });
    const response = proxy(buildRequest('/portal/registrations', patientToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects an admin session hitting /portal to the admin dashboard', () => {
    const adminToken = buildToken({ exp: futureUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/portal/registrations', adminToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/admin/dashboard`);
  });

  it('sends a doctor hitting the patient portal to their own shell', () => {
    const doctorToken = buildToken({ exp: futureUnix(), roles: ['DOCTOR'] });
    const response = proxy(buildRequest('/portal/registrations', doctorToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/doctor/dashboard`);
  });

  it('lets a doctor session into the doctor shell', () => {
    const doctorToken = buildToken({ exp: futureUnix(), roles: ['DOCTOR'] });
    const response = proxy(buildRequest('/doctor/encounters', doctorToken));

    expect(response.status).toBe(200);
  });

  it('keeps an admin out of the doctor shell, sending them home instead', () => {
    const adminToken = buildToken({ exp: futureUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/doctor/encounters', adminToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/admin/dashboard`);
  });

  it('keeps a patient out of the doctor shell', () => {
    const patientToken = buildToken({ exp: futureUnix(), roles: ['PATIENT'] });
    const response = proxy(buildRequest('/doctor/encounters', patientToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/portal/registrations`);
  });

  it('gives a doctor who is also an admin the admin shell, the larger of the two', () => {
    const dualToken = buildToken({ exp: futureUnix(), roles: ['ADMIN', 'DOCTOR'] });
    const response = proxy(buildRequest('/admin/administration', dualToken));

    expect(response.status).toBe(200);
  });

  /**
   * IMP-3: shell access follows the `portal.*` permission claim, so a custom
   * role composed in the IAM screens needs no seeded role code. The role-array
   * checks above stay valid as the fallback for pre-IMP-3 tokens.
   */
  it('lets a custom role holding portal.admin-access into the admin shell', () => {
    const customToken = buildToken({
      exp: futureUnix(),
      roles: ['FRONT_DESK_LEAD'],
      permissions: ['patient.read:any', 'portal.admin-access:any'],
    });
    const response = proxy(buildRequest('/admin/administration', customToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('routes a custom role holding portal.doctor-access to the doctor shell', () => {
    const customToken = buildToken({
      exp: futureUnix(),
      roles: ['LOCUM'],
      permissions: ['portal.doctor-access:any'],
    });

    expect(proxy(buildRequest('/doctor/encounters', customToken)).status).toBe(200);
    expect(proxy(buildRequest('/login', customToken)).headers.get('location')).toBe(
      `${BASE_URL}/doctor/dashboard`,
    );
  });

  it('routes a custom role holding portal.patient-access to the portal', () => {
    const customToken = buildToken({
      exp: futureUnix(),
      roles: ['FAMILY_CARER'],
      permissions: ['portal.patient-access:own'],
    });

    expect(proxy(buildRequest('/portal/registrations', customToken)).status).toBe(200);
    expect(proxy(buildRequest('/admin/dashboard', customToken)).headers.get('location')).toBe(
      `${BASE_URL}/portal/registrations`,
    );
  });

  it('still clears a custom role that holds no portal permission', () => {
    const customToken = buildToken({
      exp: futureUnix(),
      roles: ['FRONT_DESK_LEAD'],
      permissions: ['patient.read:any'],
    });
    const response = proxy(buildRequest('/admin/administration', customToken));

    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value).toBe('');
  });

  /**
   * SUPER_ADMIN's blanket grant includes every portal permission; the admin
   * shell must still win, exactly as it did under the role check.
   */
  it('keeps a super admin holding every portal permission pinned to the admin shell', () => {
    const superToken = buildToken({
      exp: futureUnix(),
      roles: ['SUPER_ADMIN'],
      permissions: [
        'portal.admin-access:any',
        'portal.doctor-access:any',
        'portal.patient-access:own',
      ],
    });

    expect(proxy(buildRequest('/portal/registrations', superToken)).headers.get('location')).toBe(
      `${BASE_URL}/admin/dashboard`,
    );
    expect(proxy(buildRequest('/doctor/encounters', superToken)).headers.get('location')).toBe(
      `${BASE_URL}/admin/dashboard`,
    );
    expect(proxy(buildRequest('/admin/dashboard', superToken)).status).toBe(200);
  });

  it('honours the portal permission carried by a session hint after token expiry', () => {
    const expiredAccessToken = buildToken({
      exp: pastUnix(),
      roles: ['FRONT_DESK_LEAD'],
      permissions: ['portal.admin-access:any'],
    });
    const sessionHint = buildSessionHint({
      exp: futureUnix(),
      roles: ['FRONT_DESK_LEAD'],
      permissions: ['portal.admin-access:any'],
    });
    const response = proxy(buildRequest('/admin/administration', expiredAccessToken, sessionHint));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('sends a signed-in doctor away from /login to their shell', () => {
    const doctorToken = buildToken({ exp: futureUnix(), roles: ['DOCTOR'] });
    const response = proxy(buildRequest('/login', doctorToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/doctor/dashboard`);
  });
});
