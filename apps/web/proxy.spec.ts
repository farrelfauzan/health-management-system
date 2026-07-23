// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';
import { ACCESS_TOKEN_COOKIE_NAME } from '#lib/auth/access-token-cookie';
import { REFRESH_TOKEN_COOKIE_NAME } from '#lib/auth/refresh-token-cookie';

const BASE_URL = 'http://localhost:3000';

function encodeBase64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildToken(claims: object): string {
  return `${encodeBase64Url({ alg: 'HS256', typ: 'JWT' })}.${encodeBase64Url(claims)}.signature`;
}

function buildRequest(path: string, token?: string, refreshToken?: string): NextRequest {
  const cookies = [
    token ? `${ACCESS_TOKEN_COOKIE_NAME}=${token}` : null,
    refreshToken ? `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}` : null,
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
    const response = proxy(buildRequest('/admin/users'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
  });

  it('redirects expired sessions to /login and clears the cookie', () => {
    const expiredToken = buildToken({ exp: pastUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/users', expiredToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value).toBe('');
  });

  it('redirects valid sessions without an admin role to /login and clears the cookie', () => {
    const doctorToken = buildToken({ exp: futureUnix(), roles: ['DOCTOR'] });
    const response = proxy(buildRequest('/admin/users', doctorToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value).toBe('');
  });

  it('allows /admin requests with a valid admin session', () => {
    const adminToken = buildToken({ exp: futureUnix(), roles: ['ADMIN'] });
    const response = proxy(buildRequest('/admin/users', adminToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('allows an expired access session while its refresh token remains valid', () => {
    const expiredAccessToken = buildToken({ exp: pastUnix(), roles: ['ADMIN'] });
    const refreshToken = buildToken({ exp: futureUnix(), roles: ['ADMIN'], tokenType: 'refresh' });
    const response = proxy(buildRequest('/admin/users', expiredAccessToken, refreshToken));

    expect(response.headers.get('x-middleware-next')).toBe('1');
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

  it('redirects a non-patient, non-admin session hitting /portal to /login and clears the cookie', () => {
    const doctorToken = buildToken({ exp: futureUnix(), roles: ['DOCTOR'] });
    const response = proxy(buildRequest('/portal/registrations', doctorToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${BASE_URL}/login`);
    expect(response.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value).toBe('');
  });
});
